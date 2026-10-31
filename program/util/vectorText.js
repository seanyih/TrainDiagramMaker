/*
	Text as outlines (opentype.js), so exported files look the same without the font installed.
	Noto Sans TC (OFL, fonts/), normal (500) and bold (700);
	Noto Sans JP is loaded only when a character is missing in it (e.g. 戸).
*/
const PRINT_FONT_FILES = {
	normal: ["../fonts/NotoSansTC-Medium.ttf", "../fonts/NotoSansJP-Medium.ttf"],
	bold: ["../fonts/NotoSansTC-Bold.ttf", "../fonts/NotoSansJP-Bold.ttf"]
};
const printFonts = { normal: [], bold: [] };

// weight: "normal" | "bold"; loads the fonts needed to draw `text`
async function loadPrintFonts(text, weight){
	const fonts = printFonts[weight];
	for(let i = 0; i < PRINT_FONT_FILES[weight].length; i++){
		if(!fonts[i]){
			if([...text].every(ch => fonts.some(font => font.charToGlyphIndex(ch) > 0))) break;
			fonts[i] = opentype.parse(await (await fetch(PRINT_FONT_FILES[weight][i])).arrayBuffer());
		}
	}
}

// [{ font, str }]: consecutive characters drawn with the same font
function fontRuns(str, weight){
	const fonts = printFonts[weight];
	const runs = [];
	[...str].forEach(ch => {
		const font = fonts.find(font => font.charToGlyphIndex(ch) > 0) || fonts[0];
		if(runs.length > 0 && runs[runs.length - 1].font == font) runs[runs.length - 1].str += ch;
		else                                                      runs.push({ font: font, str: ch });
	});
	return runs;
}

/*
	[{ path (opentype Path), fill }] of a <text> (Graphing.js: text, or tspans sharing one baseline, which dy shifts;
	transform is rotate(angle cx cy) at most)
*/
function textToPaths(el){
	const weight = (el.getAttribute("font-weight") == "bold") ? "bold" : "normal";
	const parts = el.children.length > 0
		? [...el.children].map(span => ({ str: span.textContent, size: Number(span.getAttribute("font-size")), fill: span.getAttribute("fill"), dx: Number(span.getAttribute("dx") || 0), dy: Number(span.getAttribute("dy") || 0) }))
		: [{ str: el.textContent, size: Number(el.getAttribute("font-size")), fill: el.getAttribute("fill"), dx: 0, dy: 0 }];
	parts.forEach(part => {
		part.runs = fontRuns(part.str, weight);
		part.width = part.runs.reduce((sum, run) => sum + run.font.getAdvanceWidth(run.str, part.size), 0);
	});

	const total = parts.reduce((sum, part) => sum + part.dx + part.width, 0);
	const anchor = el.getAttribute("text-anchor");
	let x = Number(el.getAttribute("x")) - (anchor == "middle" ? total/2 : anchor == "end" ? total : 0);
	let y = Number(el.getAttribute("y"));
	const result = [];
	parts.forEach(part => {
		x += part.dx;
		y += part.dy;
		part.runs.forEach(run => {
			result.push({ path: run.font.getPath(run.str, x, y, part.size), fill: part.fill });
			x += run.font.getAdvanceWidth(run.str, part.size);
		});
	});

	const rotate = el.getAttribute("transform")?.match(/rotate\(([^ )]+) ([^ )]+) ([^ )]+)\)/);
	if(rotate){
		const [angle, cx, cy] = rotate.slice(1).map(Number);
		const cos = Math.cos(angle*Math.PI/180);
		const sin = Math.sin(angle*Math.PI/180);
		result.forEach(({ path }) => path.commands.forEach(c => {
			["", "1", "2"].forEach(i => {
				if(c[`x${i}`] === undefined) return;
				const dx = c[`x${i}`] - cx;
				const dy = c[`y${i}`] - cy;
				c[`x${i}`] = cx + dx*cos - dy*sin;
				c[`y${i}`] = cy + dx*sin + dy*cos;
			});
		}));
	}
	return result;
}

function replaceTextWithPaths(svg){
	svg.querySelectorAll("text").forEach(el => {
		el.replaceWith(...textToPaths(el).map(({ path, fill }) => makeSVG("path", { d: path.toPathData(2), fill: fill })));
	});
}
