function makeSVG(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs)
        el.setAttribute(k, attrs[k]);
    return el;
}

function makeSVGtext(tag, text, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    var textNode = document.createTextNode(text);
    el.appendChild(textNode);
    return el;
}

// hhmm or hhmmss -> x coordinate
function timeToX(str){
	return toSec(str)/60*SETTINGS.pxPerMin + SETTINGS.margin.left - (SETTINGS.startSec/60)*SETTINGS.pxPerMin;
}

$(document).on("click","#OutputBtn",function(){
	window.setTimeout(drawDiagram, 50);
});

// trains: TRAINS, or a draft's trains for a preview
function drawDiagram(trains = TRAINS){
	checkTextFit();

	const { margin, lines, background, aliasText, pxPerKm, pxPerMin } = SETTINGS;
	const stations = ROUTE.stations;

	//clear previous result
	const o = $("#output");
	o.children().remove();

	//calculate and set dimensions of SVG
	const w = (SETTINGS.endSec - SETTINGS.startSec)*pxPerMin/60;
	const h = stations[stations.length - 1].kilo*pxPerKm;
	const width = w + margin.left + margin.right;
	const height = h + margin.top + margin.bottom;
	o.attr("width", width);
	o.attr("height", height);

	if(!background.transparent){
		o.append(makeSVG("rect", {x:0, y:0, width:width, height:height, stroke:"none", fill:background.color}));
	}

	//train lines are clipped to the plot area instead of being covered by the margins
	const clipPath = makeSVG("clipPath", {id:"plot-area"});
	clipPath.appendChild(makeSVG("rect", {x:margin.left, y:margin.top, width:w, height:h}));
	const defs = makeSVG("defs", {});
	defs.appendChild(clipPath);
	o.append(defs);

	// line segments that train numbers avoid
	const grid = createSegmentGrid();

	//time lines
	const labelY = h + margin.top + SETTINGS.timeLabel.gap + timeLabelHeight();
	const timeLabels = [];
	const step = lines.secondary.interval*60;
	for(let t = Math.ceil(SETTINGS.startSec/step)*step; t <= SETTINGS.endSec; t += step){
		const x = (t - SETTINGS.startSec)/60*pxPerMin + margin.left;
		const primary = (t % 3600 == 0);
		const line = primary ? lines.primary : lines.secondary;
		if(t != SETTINGS.startSec && t != SETTINGS.endSec){
			o.append(makeSVG("line", {x1:x, x2:x, y1:margin.top, y2:h+margin.top, stroke:line.color, 'stroke-width':line.width}));
			if(shouldAvoidTimeLine(primary)) addSegment(grid, {x1:x, y1:margin.top, x2:x, y2:h+margin.top, owner:"timeline"});
		}

		const label = makeTimeLabel(t, primary, x, labelY);
		if(label) timeLabels.push(label);
	}

	//station lines
	stations.forEach((station, i) => {
		const y = station.kilo*pxPerKm + margin.top;
		const line = ROUTE.topology.secondary[i] ? lines.secondaryStation : lines.station;
		o.append(makeSVG("line", {x1:margin.left, x2:w+margin.left, y1:y, y2:y, stroke:line.color, 'stroke-width':line.width}));
	});

	const trainLayer = $(makeSVG("g", {"clip-path":"url(#plot-area)"}));
	o.append(trainLayer);
	// numbers are placed after all lines are drawn, so they can avoid every train line
	const trainSlots = [];
	[1, 2].forEach(bound => {
		trains[bound].forEach(train => trainSlots.push({ train: train, slots: drawTrain(trainLayer, train, bound, w, grid) }));
	});
	if(SETTINGS.showTrainNumber) placeTrainNumbers(trainLayer, trainSlots, grid);

	//outline rectangle
	o.append(makeSVG("rect", {x:margin.left, y:margin.top, width:w, height:h, stroke:lines.outline.color, 'stroke-width':lines.outline.width, fill:"none"}));

	//station name (left) and alias (right)
	stations.forEach((station, i) => {
		const y = station.kilo*pxPerKm + margin.top;
		const { name, alias } = stationTextStyles(i);
		o.append(makeSVGtext("text", station.name, {x:margin.left - name.gap, y:y + name.fontSize*0.4, "font-family":"Noto Sans TC", "font-size":name.fontSize, "fill":name.color, "text-anchor":"end"}));
		if(aliasText.show){
			o.append(makeSVGtext("text", station.alias, {x:margin.left + w + alias.gap, y:y + alias.fontSize*0.4, "font-family":"Noto Sans TC", "font-size":alias.fontSize, "fill":alias.color, "text-anchor":"start"}));
		}
	});

	timeLabels.forEach(label => o.append(label));
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
	const nextDay = hour >= 24 && tl.overDay != "extended";
	const shownHour = nextDay ? hour - 24 : hour;
	const hh = tl.zeroPad ? String(shownHour).padStart(2, "0") : String(shownHour);
	const mm = String(Math.floor(sec%3600/60)).padStart(2, "0");
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
	if(nextDay && tl.overDay == "superscript" && !mmOnly && (tl.format != "simple" || primary)){
		const [, size, color] = parts[0];
		text.appendChild(makeSVGtext("tspan", "+1", {"font-size":size*0.6, "fill":color, dx:2, dy:-size*0.4}));
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
	w: width of the time axis; a line running past midnight is also drawn one day earlier / later
*/
function drawTrain(o, train, bound, w, grid){
	const stations = boundStations(bound);
	const c = SETTINGS.trainColors[train.settings.train_color];
	const stationY = order => stations[order].kilo*SETTINGS.pxPerKm + SETTINGS.margin.top;
	const line = (x1, x2, y1, y2) => {
		shifts.forEach(dx => {
			if(!visible(x1 + dx, x2 + dx)) return;
			o.append(makeSVG("line", {x1: x1 + dx, x2: x2 + dx, y1: y1, y2: y2, stroke: c, 'stroke-width':SETTINGS.trainLineWidth}));
			addSegment(grid, {x1: x1 + dx, y1: y1, x2: x2 + dx, y2: y2, owner: train});
		});
	};

	// the lines are drawn again one day earlier / later, where they reach the plot
	const left = SETTINGS.margin.left;
	const dayW = 1440*SETTINGS.pxPerMin;
	const shifts = [-dayW, 0, dayW];
	const visible = (xa, xb) => Math.max(xa, xb) >= left && Math.min(xa, xb) <= left + w;

	const slots = [];
	let record_x1 = 0;
	let record_y1 = 0;
	let prevOrder;
	let startY;

	const stops = trainStops(train, bound).filter(stop => stop.departure && stop.station_order < stations.length);
	stops.forEach((stop, j) => {
		const x1 = timeToX(arrivalTime(stop, stations));
		const x2 = timeToX(stop.departure);
		const y = stationY(stop.station_order);

		if(j == 0){
			startY = y;
		}

		//slant lines
		if(j != 0){
			const endX = (record_x1 > x1) ? x1 + dayW : x1; // unwrapped
			line(record_x1, endX, record_y1, y);

			// split by every route station passed
			const xAt = sy => record_x1 + (sy - record_y1)/(y - record_y1)*(endX - record_x1);
			for(let i = prevOrder; i < stop.station_order && y != record_y1; i++){
				const sy1 = stationY(i);
				const sy2 = stationY(i + 1);
				// the copy of the slot whose middle is inside the plot
				const midX = xAt((sy1 + sy2)/2);
				const dx = shifts.find(dx => visible(midX + dx, midX + dx));
				if(dx !== undefined) slots.push({x1: xAt(sy1) + dx, y1: sy1, x2: xAt(sy2) + dx, y2: sy2, traveled: Math.abs(sy2 - startY)});
			}
		}

		//horizontal lines
		if(x1 > x2){
			//overnight stopping
			line(x1, x2 + dayW, y, y);
		}else{
			line(x1, x2, y, y);
		}

		//update record_x1 and record_y1 (previous coordinate)
		record_x1 = x2;
		record_y1 = y;
		prevOrder = stop.station_order;
	});

	return slots;
}
