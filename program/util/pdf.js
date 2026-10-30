const PT_PER_MM = 72/25.4;

async function deflate(data){
	const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("deflate"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

const pdfNum = value => +value.toFixed(3);

// "#rrggbb"; op: "rg" (fill) | "RG" (stroke)
function pdfColor(hex, op){
	const n = parseInt(hex.slice(1), 16);
	return `${[n >> 16, (n >> 8) & 255, n & 255].map(v => +(v/255).toFixed(4)).join(" ")} ${op}`;
}

// outline of an opentype Path, filled
function pdfGlyphOps(path){
	let cx = 0;
	let cy = 0;
	const ops = path.commands.map(c => {
		if(c.type == "M" || c.type == "L"){
			cx = c.x;
			cy = c.y;
			return `${pdfNum(c.x)} ${pdfNum(c.y)} ${c.type == "M" ? "m" : "l"}`;
		}
		if(c.type == "C"){
			cx = c.x;
			cy = c.y;
			return `${[c.x1, c.y1, c.x2, c.y2, c.x, c.y].map(pdfNum).join(" ")} c`;
		}
		if(c.type == "Q"){
			// quadratic to cubic
			const c1 = [cx + 2/3*(c.x1 - cx), cy + 2/3*(c.y1 - cy)];
			const c2 = [c.x + 2/3*(c.x1 - c.x), c.y + 2/3*(c.y1 - c.y)];
			cx = c.x;
			cy = c.y;
			return `${[...c1, ...c2, c.x, c.y].map(pdfNum).join(" ")} c`;
		}
		return "h";
	});
	return [...ops, "f"];
}

// operators for the diagram's svg (Graphing.js): rect, line, polyline, text (as outlines), g (layers, maybe with clip-path)
function pdfSvgOps(parent, clips){
	const num = (el, name) => Number(el.getAttribute(name));
	return [...parent.children].flatMap(el => {
		const fill = el.getAttribute("fill");
		const stroke = el.getAttribute("stroke");
		const dash = el.getAttribute("stroke-dasharray");
		const strokeStyle = stroke && stroke != "none" ? [
			pdfColor(stroke, "RG"),
			`${pdfNum(num(el, "stroke-width"))} w`,
			...(el.getAttribute("stroke-linecap") == "round" ? ["1 J"] : []),
			...(dash ? [`[${dash.split(" ").map(Number).map(pdfNum).join(" ")}] 0 d`] : [])
		] : [];

		if(el.tagName == "g"){
			const clip = el.getAttribute("clip-path");
			if(!clip) return pdfSvgOps(el, clips);
			const [x, y, w, h] = clips[clip.slice(5, -1)];
			return ["q", `${x} ${y} ${w} ${h} re W n`, ...pdfSvgOps(el, clips), "Q"];
		}
		if(el.tagName == "rect"){
			const rect = ["x", "y", "width", "height"].map(name => pdfNum(num(el, name))).join(" ");
			const hasFill = fill && fill != "none";
			if(!hasFill && strokeStyle.length == 0) return [];
			return ["q", ...(hasFill ? [pdfColor(fill, "rg")] : []), ...strokeStyle, `${rect} re ${hasFill ? (strokeStyle.length > 0 ? "B" : "f") : "S"}`, "Q"];
		}
		if(el.tagName == "line"){
			const [x1, y1, x2, y2] = ["x1", "y1", "x2", "y2"].map(name => pdfNum(num(el, name)));
			return ["q", ...strokeStyle, `${x1} ${y1} m ${x2} ${y2} l S`, "Q"];
		}
		if(el.tagName == "polyline"){
			const points = el.getAttribute("points").split(" ").map(p => p.split(",").map(Number).map(pdfNum).join(" "));
			// svg's default miter limit
			return ["q", ...strokeStyle, "4 M", `${points.map((p, i) => `${p} ${i == 0 ? "m" : "l"}`).join(" ")} S`, "Q"];
		}
		if(el.tagName == "text"){
			return textToPaths(el).flatMap(({ path, fill }) => ["q", pdfColor(fill, "rg"), ...pdfGlyphOps(path), "Q"]);
		}
		return [];
	});
}

/*
	One-page vector PDF of the diagram's svg (width / height in px, 1 px = 1/ppi inch).
	sheet: { width, height } in mm, the media / bleed box
	trim:  { x, y, width, height } in mm from the top left of the sheet
*/
async function svgToPdf(svg, sheet, trim, ppi){
	const clips = {};
	svg.querySelectorAll("clipPath").forEach(clip => {
		const rect = clip.querySelector("rect");
		clips[clip.id] = ["x", "y", "width", "height"].map(name => pdfNum(Number(rect.getAttribute(name))));
	});
	// px to pt, y down
	const scale = 72/ppi;
	const content = await deflate(new TextEncoder().encode([`${scale} 0 0 ${-scale} 0 ${pdfNum(sheet.height*PT_PER_MM)} cm`, ...pdfSvgOps(svg, clips)].join("\n")));

	const pt = mm => pdfNum(mm*PT_PER_MM);
	const W = pt(sheet.width);
	const H = pt(sheet.height);
	const trimBox = [trim.x, sheet.height - trim.y - trim.height, trim.x + trim.width, sheet.height - trim.y].map(pt).join(" ");

	const enc = new TextEncoder();
	const chunks = [];
	const offsets = [];
	let length = 0;
	const put = data => {
		const bytes = (typeof data == "string") ? enc.encode(data) : data;
		chunks.push(bytes);
		length += bytes.length;
	};
	const object = (n, head, stream) => {
		offsets[n] = length;
		put(`${n} 0 obj\n${head}\n`);
		if(stream){
			put("stream\n");
			put(stream);
			put("\nendstream\n");
		}
		put("endobj\n");
	};

	put("%PDF-1.4\n");
	object(1, "<< /Type /Catalog /Pages 2 0 R >>");
	object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
	object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /BleedBox [0 0 ${W} ${H}] /TrimBox [${trimBox}] /Resources << >> /Contents 4 0 R >>`);
	object(4, `<< /Filter /FlateDecode /Length ${content.length} >>`, content);

	const xref = length;
	put(`xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`);
	put(`trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

	return new Uint8Array(await new Blob(chunks).arrayBuffer());
}
