function makeSVG(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs)
        el.setAttribute(k, attrs[k]);
    return el;
}

function setAttrs(el, attrs){
	for(var k in attrs) el.setAttribute(k, attrs[k]);
	return el;
}

function makeSVGtext(tag, text, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    var textNode = document.createTextNode(text);
    el.appendChild(textNode);
    return el;
}

// attributes of a line of the given type; dots are round caps on zero-length dashes
function lineStyleAttrs(type, width){
	if(type == "dashed") return {"stroke-dasharray": `${width*5} ${width*3}`};
	if(type == "dotted") return {"stroke-dasharray": `0 ${width*2.5}`, "stroke-linecap": "round"};
	return {};
}

// a straight line in the given style ({ width, color, type })
function makeStyledLine(x1, x2, y1, y2, style){
	return makeSVG("line", {x1:x1, x2:x2, y1:y1, y2:y2, stroke:style.color, 'stroke-width':style.width, ...lineStyleAttrs(style.type, style.width)});
}

// first and last route station index drawn (SETTINGS.stationRange; null end = the last station)
function stationRange(){
	const last = ROUTE.stations.length - 1;
	const { start, end } = SETTINGS.stationRange;
	const to = end ?? last;
	return (start < to && to <= last) ? { start: start, end: to } : { start: 0, end: last };
}

// height of the plot in px
function plotHeight(){
	const { start, end } = stationRange();
	return (ROUTE.stations[end].kilo - ROUTE.stations[start].kilo)*SETTINGS.pxPerKm;
}

function kiloToY(kilo){
	return (kilo - ROUTE.stations[stationRange().start].kilo)*SETTINGS.pxPerKm + SETTINGS.margin.top;
}

// hhmm or hhmmss -> x coordinate
function timeToX(str){
	return toSec(str)/60*SETTINGS.pxPerMin + SETTINGS.margin.left - (SETTINGS.startSec/60)*SETTINGS.pxPerMin;
}

$(document).on("click","#OutputBtn",function(){
	window.setTimeout(drawDiagram, 50);
});

const INKSCAPE_NS = "http://www.inkscape.org/namespaces/inkscape";
const PLOT_CLIP = {"clip-path":"url(#plot-area)"};

// layers of the diagram (SETTINGS.layers), bottom to top: [id, name]
const LAYERS = {
	background:   ["layer-background", "背景"],
	timeLines:    ["layer-time-lines", "時間線"],
	stationLines: ["layer-station-lines", "車站線"],
	trainLines:   ["layer-train-lines", "列車線"],
	trainNumbers: ["layer-train-numbers", "列車號文字"],
	outline:      ["layer-outline", "圖框"],
	stationText:  ["layer-station-text", "文字-車站"],
	timeText:     ["layer-time-text", "文字-時間"],
	footer:       ["layer-footer", "文字-基本資料"]
};
const BOUND_NAMES = { 1: "順行", 2: "逆行" };

// a group that Inkscape takes as a layer; Illustrator takes the top-level groups as layers, named by data-name
function makeLayer(id, name, attrs = {}){
	const g = makeSVG("g", {id: id, "data-name": name, ...attrs});
	g.setAttributeNS(INKSCAPE_NS, "inkscape:groupmode", "layer");
	g.setAttributeNS(INKSCAPE_NS, "inkscape:label", name);
	return g;
}

// "hhmm" of a time line at sec (from 00:00 of the first day; the day before: "prev-hhmm")
function timeId(sec){
	return (sec < 0) ? `prev-${secToHhmm(sec + 86400)}` : secToHhmm(sec);
}

// id of train i of `bound`, as drawn in drawDiagram(): "train-{bound}-{i}"
function trainId(bound, i){
	return `train-${bound}-${i}`;
}

// trains: TRAINS, or a draft's trains for a preview; o: the svg to draw in (jQuery);
// page: of the footer (makeFooter()), from the print mode; otherwise the svg is the only page
function drawDiagram(trains = TRAINS, o = $("#output"), page = null){
	if(o.is("#output")) checkTextFit();

	const { margin, lines, background, aliasText, pxPerKm, pxPerMin } = SETTINGS;
	const stations = ROUTE.stations;

	//clear previous result
	o.children().remove();

	//calculate and set dimensions of SVG
	const w = (SETTINGS.endSec - SETTINGS.startSec)*pxPerMin/60;
	const h = plotHeight();
	const range = stationRange();
	const width = w + margin.left + margin.right;
	const height = h + margin.top + margin.bottom;
	o.attr("width", width);
	o.attr("height", height);
	o[0].setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:inkscape", INKSCAPE_NS);

	// the group to draw `key` in: its layer, or the svg itself (clipped: one group shared by the train lines and numbers)
	const layered = SETTINGS.layers.enabled;
	let plotGroup = null;
	const layer = (key, clipped = false) => {
		if(layered){
			const g = $(makeLayer(...LAYERS[key], clipped ? PLOT_CLIP : {}));
			o.append(g);
			return g;
		}
		if(!clipped) return o;
		if(!plotGroup){
			plotGroup = $(makeSVG("g", PLOT_CLIP));
			o.append(plotGroup);
		}
		return plotGroup;
	};

	//train lines are clipped to the plot area instead of being covered by the margins
	const clipPath = makeSVG("clipPath", {id:"plot-area"});
	clipPath.appendChild(makeSVG("rect", {x:margin.left, y:margin.top, width:w, height:h}));
	const defs = makeSVG("defs", {});
	defs.appendChild(clipPath);
	o.append(defs);

	if(!background.transparent){
		layer("background").append(makeSVG("rect", {x:0, y:0, width:width, height:height, stroke:"none", fill:background.color}));
	}

	// line segments that train numbers avoid
	const grid = createSegmentGrid();

	//time lines
	const oudia = SETTINGS.oudiaStyle.enabled;
	const frame = oudia ? oudiaFrame(w, h) : null;
	const timeLayer = layer("timeLines");
	const labelY = h + margin.top + SETTINGS.timeLabel.gap + timeLabelHeight();
	const timeLabels = [];
	const step = lines.secondary.interval*60;
	for(let t = Math.ceil(SETTINGS.startSec/step)*step; t <= SETTINGS.endSec; t += step){
		const x = (t - SETTINGS.startSec)/60*pxPerMin + margin.left;
		const primary = (t % 3600 == 0);
		const line = primary ? lines.primary : lines.secondary;
		if(t != SETTINGS.startSec && t != SETTINGS.endSec && !oudia){
			const el = makeStyledLine(x, x, margin.top, h+margin.top, line);
			setAttrs(el, {id:`timeline-${timeId(t)}`, class:`timeline ${primary ? "primary" : "secondary"}`, "data-sec":t});
			timeLayer.append(el);
			if(shouldAvoidTimeLine(primary)) addSegment(grid, {x1:x, y1:margin.top, x2:x, y2:h+margin.top, owner:"timeline"});
		}

		const label = oudia ? null : makeTimeLabel(t, primary, x, labelY);
		if(label) timeLabels.push(label);
	}

	if(oudia){
		drawOudiaTimeLines(timeLayer, grid, frame.y1, h);
		timeLabels.push(...oudiaTimeLabels(frame.y1));
	}

	//minute lines: dots at the minutes without a time line
	if(lines.minute.enabled && !oudia){
		for(let t = Math.ceil(SETTINGS.startSec/60)*60; t < SETTINGS.endSec; t += 60){
			if(t % step == 0) continue;
			const x = (t - SETTINGS.startSec)/60*pxPerMin + margin.left;
			timeLayer.append(makeSVG("line", {x1:x, x2:x, y1:margin.top, y2:h+margin.top, stroke:lines.minute.color, 'stroke-width':lines.minute.width, 'stroke-dasharray':`0 ${pxPerKm}`, 'stroke-linecap':"round",
				id:`minuteline-${timeId(t)}`, class:"minuteline", "data-sec":t}));
		}
	}

	//station lines
	const stationLayer = layer("stationLines");
	stations.forEach((station, i) => {
		if(i < range.start || i > range.end) return;
		const y = kiloToY(station.kilo);
		const secondary = ROUTE.topology.secondary[i];
		const style = oudia ? oudiaLine(false) : secondary ? lines.secondaryStation : lines.station;
		const el = makeStyledLine(oudia ? frame.x1 : margin.left, w+margin.left, y, y, style);
		setAttrs(el, {id:`stationline-${i}`, class:`stationline${secondary ? " secondary" : ""}`, "data-station":station.name, "data-kilo":station.kilo});
		stationLayer.append(el);
	});

	// the group of each train: sublayers by direction and / or color, created in order of direction, color
	const trainLayer = layer("trainLines", true);
	const { trainByDirection, trainByColor } = SETTINGS.layers;
	const subKeys = (bound, train) => [
		...(trainByDirection ? [[`${bound}`, BOUND_NAMES[bound]]] : []),
		...(trainByColor ? [[`color-${train.settings.train_color}`, train.settings.train_color ? `顏色${train.settings.train_color}` : "未指定顏色"]] : [])
	];
	const subLayers = new Map();
	const trainParent = (bound, train) => layered ? subKeys(bound, train).reduce((parent, [key, name]) => {
		const id = `${parent.attr("id")}-${key}`;
		if(!subLayers.has(id)){
			subLayers.set(id, $(makeLayer(id, name)));
			parent.append(subLayers.get(id));
		}
		return subLayers.get(id);
	}, trainLayer) : trainLayer;
	if(layered){
		const order = (bound, train) => trainByDirection ? bound*100 + train.settings.train_color : train.settings.train_color;
		[1, 2].flatMap(bound => trains[bound].filter(train => !train.hidden).map(train => ({ bound, train })))
			.sort((a, b) => order(a.bound, a.train) - order(b.bound, b.train))
			.forEach(({ bound, train }) => trainParent(bound, train));
	}

	// numbers are placed after all lines are drawn, so they can avoid every train line. hidden trains are not drawn
	const trainSlots = [];
	[1, 2].forEach(bound => {
		trains[bound].forEach((train, i) => {
			if(!train.hidden) trainSlots.push({ train: train, id: trainId(bound, i), slots: drawTrain(trainParent(bound, train), train, bound, w, grid, trainId(bound, i)) });
		});
	});
	if(SETTINGS.showTrainNumber) placeTrainNumbers(layered ? layer("trainNumbers", true) : trainLayer, trainSlots, grid);

	//outline rectangle
	// each side has its own width; the lines are extended so that the corners are filled
	const outlineLayer = layer("outline");
	const { top, bottom, left, right, color } = lines.outline;
	const x1 = margin.left;
	const x2 = margin.left + w;
	const y1 = margin.top;
	const y2 = margin.top + h;
	if(oudia) drawOudiaFrame(outlineLayer, frame);
	else [
		[top, x1 - left/2, x2 + right/2, y1, y1],
		[bottom, x1 - left/2, x2 + right/2, y2, y2],
		[left, x1, x1, y1 - top/2, y2 + bottom/2],
		[right, x2, x2, y1 - top/2, y2 + bottom/2]
	].forEach(([width, xa, xb, ya, yb]) => {
		if(width > 0) outlineLayer.append(makeSVG("line", {x1:xa, x2:xb, y1:ya, y2:yb, stroke:color, 'stroke-width':width}));
	});

	//station name (left) and alias (right); OuDia: the name above its line, no alias
	const stationTextLayer = layer("stationText");
	stations.forEach((station, i) => {
		if(i < range.start || i > range.end) return;
		const y = kiloToY(station.kilo);
		const { name, alias } = stationTextStyles(i);
		stationTextLayer.append(makeSVGtext("text", station.name, {x:margin.left - name.gap, y:y + name.fontSize*(oudia ? -0.2 : 0.4), "font-family":"Noto Sans TC", "font-size":name.fontSize, "fill":name.color, "text-anchor":"end"}));
		if(aliasText.show && !oudia){
			stationTextLayer.append(makeSVGtext("text", station.alias, {x:margin.left + w + alias.gap, y:y + alias.fontSize*0.4, "font-family":"Noto Sans TC", "font-size":alias.fontSize, "fill":alias.color, "text-anchor":"start"}));
		}
	});

	const timeTextLayer = layer("timeText");
	timeLabels.forEach(label => timeTextLayer.append(label));

	if(SETTINGS.footer.enabled){
		page = page ?? { opmode: currentOpmode, index: 1, number: SETTINGS.footer.startPage, startSec: SETTINGS.startSec, endSec: SETTINGS.endSec, trim: { x: 0, y: 0, width: width, height: height } };
		layer("footer").append(makeFooter(page, margin.top + h));
	}
}

/*
	page: { opmode (index), index (1, 2... in the mode), number (<pages>), startSec, endSec (its time range),
	trim: { x, y, width, height } (the page without the bleed, px) }
*/
function footerText(page){
	const { start, end } = stationRange();
	const tokens = {
		title: INFO.title,
		sta_range: `${ROUTE.stations[start].name} = ${ROUTE.stations[end].name}`,
		opmode: opmodeName(OPMODES[page.opmode], page.opmode),
		index: page.index,
		time_range: `${secToHhmm(page.startSec)} ~ ${secToHhmm(page.endSec)}`,
		pages: page.number
	};
	return SETTINGS.footer.text.replace(/<(\w+)>/g, (token, key) => Object.hasOwn(tokens, key) ? tokens[key] : token);
}

// at the bottom center of the page, its gap from the page's bottom edge or below the text under the plot
function makeFooter(page, plotBottom){
	const f = SETTINGS.footer;
	const y = (f.base == "page") ? page.trim.y + page.trim.height - f.gap : plotBottom + textExtent().bottom + f.gap + f.fontSize;
	return makeSVGtext("text", footerText(page), {x:page.trim.x + page.trim.width/2, y:y, "font-family":"Noto Sans TC", "font-size":f.fontSize, "fill":f.color, "text-anchor":"middle"});
}

// text settings of route station i's name and alias
function stationTextStyles(i){
	return ROUTE.topology.secondary[i]
		? { name: SETTINGS.secondaryStationText, alias: SETTINGS.secondaryAliasText }
		: { name: SETTINGS.stationText, alias: SETTINGS.aliasText };
}

// label under a time line, or null if this line has no label
function makeTimeLabel(sec, primary, x, y){
	const tl = SETTINGS.timeLabel;
	const f = tl.formats[tl.format];
	if(!primary && (SETTINGS.lines.secondary.interval < 10 || tl.secondaryLabel == "none")) return null;

	const hour = Math.floor(sec/3600);
	// the previous day appears when a print page overlaps the one before
	const prevDay = hour < 0;
	const nextDay = hour >= 24 && tl.overDay != "extended";
	const shownHour = nextDay ? hour - 24 : prevDay ? hour + 24 : hour;
	const hh = tl.zeroPad ? String(shownHour).padStart(2, "0") : String(shownHour);
	const mm = String(Math.floor((sec - hour*3600)/60)).padStart(2, "0");
	const mmOnly = !primary && tl.secondaryLabel == "mm";

	// [text, font size, color]
	let parts;
	if(tl.format == "sized"){
		parts = mmOnly ? [] : [[hh, f.hourFontSize, f.hourColor]];
		parts.push([mm, f.minuteFontSize, f.minuteColor]);
	}else if(tl.format == "simple"){
		parts = [[primary ? hh : mm, f.fontSize, f.color]];
	}else{
		parts = [[mmOnly ? mm : `${hh}:${mm}`, f.fontSize, f.color]];
	}

	// tspans share one baseline, so different sizes are bottom aligned
	const text = makeSVG("text", {x:x, y:y, "font-family":"Noto Sans TC", "text-anchor":"middle"});
	parts.forEach(([str, size, color]) => text.appendChild(makeSVGtext("tspan", str, {"font-size":size, "fill":color})));
	if((nextDay || prevDay) && tl.overDay == "superscript" && !mmOnly && (tl.format != "simple" || primary)){
		const [, size, color] = parts[0];
		text.appendChild(makeSVGtext("tspan", nextDay ? "+1" : "-1",{"font-size":size*0.6, "fill":color, dx:2, dy:-size*0.4}));
	}
	return text;
}

function timeLabelHeight(){
	const tl = SETTINGS.timeLabel;
	const f = tl.formats[tl.format];
	return (tl.format == "sized") ? Math.max(f.hourFontSize, f.minuteFontSize) : f.fontSize;
}

/*
	Draws one train and adds its lines to `grid` (for train number collision).
	Returns the slots for train numbers: one per interval between two adjacent route stations the train runs through,
	{ x1, y1, x2, y2, traveled }, where (x1, y1) ~ (x2, y2) is the train line inside the interval (x may exceed the plot for overnight)
	and traveled is the distance in px from the first stop to the end of the interval.
	w: width of the time axis; a line running past midnight is also drawn one day earlier / later.
	id: of the train's element (trainId()); with SETTINGS.connectTrainLines the train is one <polyline> per day it is drawn on,
	otherwise a <g> of <line>s; the copies one day earlier / later get the id + "-prev-day" / "-next-day"
*/
function drawTrain(o, train, bound, w, grid, id){
	const stations = boundStations(bound);
	const c = SETTINGS.trainColors[train.settings.train_color];
	const color = train.settings.train_color;
	const lineWidth = train.settings.line_width ?? SETTINGS.trainLineWidthByColor[color] ?? SETTINGS.trainLineWidth;
	const lineType = train.settings.line_type ?? (SETTINGS.trainLineTypeByColor[color] || SETTINGS.trainLineType);
	const style = {stroke: c, 'stroke-width':lineWidth, ...lineStyleAttrs(lineType, lineWidth)};
	const stationY = order => kiloToY(stations[order].kilo);
	const plotBottom = SETTINGS.margin.top + plotHeight();

	// the lines are drawn again one day earlier / later, where they reach the plot
	const left = SETTINGS.margin.left;
	const dayW = 1440*SETTINGS.pxPerMin;
	const shifts = [-dayW, 0, dayW];
	const visible = (xa, xb) => Math.max(xa, xb) >= left && Math.min(xa, xb) <= left + w;

	// the train line, x unwrapped: a time earlier than the one before is on the next day
	const segments = [];
	const points = [];
	const to = (x, y) => {
		const last = points[points.length - 1];
		if(last) segments.push({x1: last.x, y1: last.y, x2: x, y2: y});
		points.push({x: x, y: y});
	};

	const slots = [];
	const marks = [];
	let dayX = 0;
	let prevOrder;
	let startY;

	const stops = trainStops(train, bound).filter(stop => stop.departure && stop.station_order < stations.length);
	const { enabled: oudia, stopMarks } = SETTINGS.oudiaStyle;
	stops.forEach((stop, j) => {
		const prev = points[points.length - 1];
		const brief = oudia && j > 0 && j < stops.length - 1 && isBriefStop(stop);
		let x1 = timeToX(brief ? stop.departure : arrivalTime(stop, stations)) + dayX;
		if(prev && prev.x > x1){
			dayX += dayW;
			x1 += dayW;
		}
		let x2 = timeToX(stop.departure) + dayX;
		if(x1 > x2){
			//overnight stopping
			dayX += dayW;
			x2 += dayW;
		}
		const y = stationY(stop.station_order);

		if(j == 0){
			startY = y;
			points.push({x: x1, y: y});
		}else{
			//slant lines
			to(x1, y);

			// split by every route station passed
			const xAt = sy => prev.x + (sy - prev.y)/(y - prev.y)*(x1 - prev.x);
			for(let i = prevOrder; i < stop.station_order && y != prev.y; i++){
				const sy1 = stationY(i);
				const sy2 = stationY(i + 1);
				// the copy of the slot whose middle is inside the plot
				const midX = xAt((sy1 + sy2)/2);
				const dx = shifts.find(dx => visible(midX + dx, midX + dx));
				const inRange = Math.min(sy1, sy2) >= SETTINGS.margin.top - 1e-6 && Math.max(sy1, sy2) <= plotBottom + 1e-6;
				if(dx !== undefined && inRange) slots.push({x1: xAt(sy1) + dx, y1: sy1, x2: xAt(sy2) + dx, y2: sy2, traveled: Math.abs(sy2 - startY)});
			}
		}

		//horizontal lines
		to(x2, y);
		prevOrder = stop.station_order;
		if(brief && stopMarks) marks.push({x: x2, y: y});
	});

	const copyId = dx => (dx < 0) ? `${id}-prev-day` : (dx > 0) ? `${id}-next-day` : id;
	const attrs = dx => ({id: copyId(dx), class: "train-line", "data-train": id, "data-bound": bound, "data-train-number": train.train_number});
	shifts.forEach(dx => {
		const shown = segments.filter(seg => visible(seg.x1 + dx, seg.x2 + dx));
		if(shown.length == 0) return;
		shown.forEach(seg => addSegment(grid, {x1: seg.x1 + dx, y1: seg.y1, x2: seg.x2 + dx, y2: seg.y2, owner: train}));

		if(SETTINGS.connectTrainLines){
			// repeated points (no dwell) are left out
			const path = points.filter((p, k) => k == 0 || p.x != points[k - 1].x || p.y != points[k - 1].y);
			if(path.length < 2) return;
			o.append(makeSVG("polyline", {points: path.map(p => `${p.x + dx},${p.y}`).join(" "), fill: "none", ...style, ...attrs(dx)}));
		}else{
			const g = makeSVG("g", attrs(dx));
			shown.forEach(seg => g.appendChild(makeSVG("line", {x1: seg.x1 + dx, x2: seg.x2 + dx, y1: seg.y1, y2: seg.y2, ...style})));
			o.append(g);
		}
		marks.forEach(m => {
			if(visible(m.x + dx, m.x + dx)) o.append(setAttrs(makeStopMark(m.x + dx, m.y, c, lineWidth), {"data-train": id}));
		});
	});

	return slots;
}
