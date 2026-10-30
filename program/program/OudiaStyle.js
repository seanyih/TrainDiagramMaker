/*
	The OuDia look (SETTINGS.oudiaStyle), drawn by drawDiagram() / drawTrain() / placeTrainNumbers():
	a frame around the station names and the plot, three levels of time lines in the axis color, hours above the frame,
	station names above their lines, train numbers from the origin, brief stops drawn at their departure with a dot.
*/

// OuDia's time scales (CDcdDiagram::m_arVline): minutes between the dotted, thin and bold lines
const OUDIA_TIME_SCALES = [[1, 5, 30], [2, 10, 60], [5, 10, 60], [10, 30, 60], [15, 15, 60], [20, 20, 60], [30, 30, 60], [60, 60, 60]];

function oudiaLine(bold, type = "solid"){
	const { axisColor, lineWidth } = SETTINGS.oudiaStyle;
	return { width: bold ? lineWidth*2 : lineWidth, color: axisColor, type: type };
}

// px the frame reaches outside the plot: the station name column (left), the band above the first station for its name (top)
function oudiaFrameExtent(){
	const { start, end } = stationRange();
	const left = Math.max(...ROUTE.stations.slice(start, end + 1).map((station, j) => {
		const { name } = stationTextStyles(start + j);
		return station.name.length*name.fontSize + 2*name.gap;
	}));
	return { left: left, top: stationTextStyles(start).name.fontSize*1.2 };
}

function oudiaFrame(w, h){
	const { margin } = SETTINGS;
	const ext = oudiaFrameExtent();
	return { x1: margin.left - ext.left, x2: margin.left + w, y1: margin.top - ext.top, y2: margin.top + h };
}

// the frame, and the line between the station names and the plot
function drawOudiaFrame(o, frame){
	const { color, width } = oudiaLine(true);
	o.append(makeSVG("rect", {x:frame.x1, y:frame.y1, width:frame.x2 - frame.x1, height:frame.y2 - frame.y1, fill:"none", stroke:color, "stroke-width":width}));
	o.append(makeStyledLine(SETTINGS.margin.left, SETTINGS.margin.left, frame.y1, frame.y2, oudiaLine(true)));
}

// the time lines from the frame's top; the bold ones count as primary time lines for avoidance, the thin ones as secondary
function drawOudiaTimeLines(o, grid, top, h){
	const { margin, startSec, endSec, pxPerMin } = SETTINGS;
	const [dotted, thin, bold] = OUDIA_TIME_SCALES[SETTINGS.oudiaStyle.timeScale].map(min => min*60);
	for(let t = Math.ceil(startSec/dotted)*dotted; t < endSec; t += dotted){
		if(t == startSec) continue;
		const x = (t - startSec)/60*pxPerMin + margin.left;
		const level = (t % bold == 0) ? "bold" : (t % thin == 0) ? "thin" : "dotted";
		const el = makeStyledLine(x, x, top, h + margin.top, oudiaLine(level == "bold", level == "dotted" ? "dotted" : "solid"));
		setAttrs(el, {id:`timeline-${timeId(t)}`, class:`timeline ${level}`, "data-sec":t});
		o.append(el);
		if(level != "dotted" && shouldAvoidTimeLine(level == "bold")) addSegment(grid, {x1:x, y1:margin.top, x2:x, y2:h + margin.top, owner:"timeline"});
	}
}

// the hours (0 ~ 23) above the frame, left aligned to their time lines
function oudiaTimeLabels(top){
	const { startSec, endSec, pxPerMin, margin, timeLabel } = SETTINGS;
	const { fontSize, color } = timeLabel.formats.standard;
	const labels = [];
	for(let t = Math.ceil(startSec/3600)*3600; t < endSec; t += 3600){
		const x = (t - startSec)/60*pxPerMin + margin.left + SETTINGS.oudiaStyle.lineWidth;
		const hour = (t/3600 % 24 + 24) % 24;
		labels.push(makeSVGtext("text", String(hour), {x:x, y:top - timeLabel.gap, "font-family":"Noto Sans TC", "font-size":fontSize, fill:color, "text-anchor":"start"}));
	}
	return labels;
}

// an intermediate stop (not a pass) shorter than a minute, or with its arrival unknown: drawn at its departure only
function isBriefStop(stop){
	if(!stop.arrival) return true;
	return stop.arrival != stop.departure && (toSec(stop.departure) - toSec(stop.arrival) + 86400) % 86400 < 60;
}

// OuDia's 停車駅明示, in the train's color
function makeStopMark(x, y, color, lineWidth){
	return makeSVG("circle", {cx:x, cy:y, r:lineWidth + 1.5, fill:color, stroke:"none", class:"stop-mark"});
}

// the text placed on a train line
function trainLabel(train){
	const name = SETTINGS.oudiaStyle.enabled && SETTINGS.oudiaStyle.showTrainName ? train.settings.train_name : "";
	return [train.train_number, name].filter(s => s).join(" ");
}
