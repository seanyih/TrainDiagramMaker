/*
	Print mode: the settings' px are 1/ppi inch, so the output has an exact size.
	The diagram is cut into pages by time; each page is drawn by drawDiagram() with the margins and time range of the page,
	and exported (SETTINGS.print.format) as one file of the page plus its bleed, all in one zip:
	"svg" (text kept as text), "pdf" (text as outlines), "svgPath" (SVG with text as outlines)
*/

const MM_PER_INCH = 25.4;
// with SETTINGS.print.overlap, a page also draws this many minutes before and after its range
const PRINT_OVERLAP_MIN = 10;

function mmToPx(mm){
	return mm*SETTINGS.print.ppi/MM_PER_INCH;
}

function pxToMm(px){
	return px*MM_PER_INCH/SETTINGS.print.ppi;
}

// px the text reaches outside the plot frame
function textExtent(){
	const { pxPerKm, aliasText } = SETTINGS;
	const { start, end } = stationRange();
	const stations = ROUTE.stations.slice(start, end + 1);
	const h = plotHeight();
	// field: "name" | "alias"
	const widest = field => Math.max(...stations.map((station, j) => {
		const i = start + j;
		const text = stationTextStyles(i)[field];
		return station[field].length*text.fontSize + text.gap;
	}));

	// text spans from 0.6 font size above its baseline to 0.4 below
	let top = 0;
	let bottom = timeLabelHeight() + SETTINGS.timeLabel.gap;
	stations.forEach((station, j) => {
		const { name, alias } = stationTextStyles(start + j);
		const fontSize = aliasText.show ? Math.max(name.fontSize, alias.fontSize) : name.fontSize;
		const y = (station.kilo - stations[0].kilo)*pxPerKm;
		top = Math.max(top, fontSize*0.6 - y);
		bottom = Math.max(bottom, y + fontSize*0.4 - h);
	});
	return { left: widest("name"), right: aliasText.show ? widest("alias") : 0, top, bottom };
}

/*
	All lengths in mm. frame: the plot of a full page; ext: text outside the frame;
	pad: page edge to the frame, padText: to the outermost text (negative: into the bleed);
	over: the side whose text is outside the bleed
*/
function printLayout(){
	const { page, bleed, align, pageMinutes, overlap } = SETTINGS.print;
	const rangeMin = (SETTINGS.endSec - SETTINGS.startSec)/60;
	const frame = {
		w: pxToMm((Math.min(pageMinutes, rangeMin) + (overlap ? 2*PRINT_OVERLAP_MIN : 0))*SETTINGS.pxPerMin),
		h: pxToMm(plotHeight())
	};
	const ext = Object.fromEntries(Object.entries(textExtent()).map(([side, px]) => [side, pxToMm(px)]));

	// returns [pad of the first side (top / left), pad of the other]
	const place = (a, first, size, total) => {
		const near = a.offset + (a.base == "text" ? ext[a.side] : 0);
		return (a.side == first) ? [near, total - near - size] : [total - near - size, near];
	};
	const [top, bottom] = place(align.v, "top", frame.h, page.height);
	const [left, right] = place(align.h, "left", frame.w, page.width);
	const pad = { top, bottom, left, right };

	const padText = {};
	const over = {};
	Object.keys(pad).forEach(side => {
		padText[side] = pad[side] - ext[side];
		over[side] = padText[side] < -bleed[side] - 1e-9;
	});
	return { frame, ext, pad, padText, over, pages: Math.ceil(rangeMin/pageMinutes) };
}

// the svg's size is the sheet's in mm
function svgToBytes(svg, sheet){
	svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
	svg.setAttribute("viewBox", `0 0 ${svg.getAttribute("width")} ${svg.getAttribute("height")}`);
	svg.setAttribute("width", `${sheet.width}mm`);
	svg.setAttribute("height", `${sheet.height}mm`);
	return new TextEncoder().encode(`<?xml version="1.0" standalone="no"?>
${svg.outerHTML}`);
}

// returns the failure reason, or null when the zip is downloaded
async function exportPrintZip(){
	const { page, bleed, align, pageMinutes, format, ppi, overlap } = SETTINGS.print;
	const overlapSec = overlap ? PRINT_OVERLAP_MIN*60 : 0;
	const layout = printLayout();
	if(Object.values(layout.over).some(over => over)) return "圖面超出頁面 (出血以外)";

	const sheet = { width: page.width + bleed.left + bleed.right, height: page.height + bleed.top + bleed.bottom };
	const trim = { x: bleed.left, y: bleed.top, width: page.width, height: page.height };
	const sheetPx = { width: mmToPx(sheet.width), height: mmToPx(sheet.height) };
	const h = mmToPx(layout.frame.h);

	// each page is drawn with its own range and margins
	const saved = { startSec: SETTINGS.startSec, endSec: SETTINGS.endSec, margin: SETTINGS.margin };
	const files = [];
	if(format != "svg"){
		const { start, end } = stationRange();
		const names = ROUTE.stations.slice(start, end + 1).map(station => station.name + station.alias).join("");
		await loadPrintFonts(`${names}0123456789:+-`, "normal");
		if(SETTINGS.showTrainNumber) await loadPrintFonts([...TRAINS[1], ...TRAINS[2]].map(train => train.train_number).join(""), "bold");
	}
	try{
		for(let i = 0; i < layout.pages; i++){
			const pageStart = saved.startSec + i*pageMinutes*60;
			const pageEnd = Math.min(pageStart + pageMinutes*60, saved.endSec);
			SETTINGS.startSec = pageStart - overlapSec;
			SETTINGS.endSec = pageEnd + overlapSec;
			const w =(SETTINGS.endSec - SETTINGS.startSec)/60*SETTINGS.pxPerMin;
			const left = (align.h.side == "left") ? layout.pad.left : page.width - layout.pad.right - pxToMm(w);
			const top = mmToPx(bleed.top + layout.pad.top);
			SETTINGS.margin = {
				left: mmToPx(bleed.left + left),
				right: sheetPx.width - mmToPx(bleed.left + left) - w,
				top: top,
				bottom: sheetPx.height - top - h
			};

			const svg = $(makeSVG("svg", {}));
			drawDiagram(TRAINS, svg);
			const name = `TrainDiagram_${String(i + 1).padStart(2, "0")}`;
			if(format == "pdf"){
				files.push({ name: `${name}.pdf`, data: await svgToPdf(svg[0], sheet, trim, ppi) });
			}else{
				if(format == "svgPath") replaceTextWithPaths(svg[0]);
				files.push({ name: `${name}.svg`, data: svgToBytes(svg[0], sheet) });
			}
		}
	}finally{
		Object.assign(SETTINGS, saved);
	}

	downloadFile("TrainDiagram.zip", makeZip(files));
	return null;
}
