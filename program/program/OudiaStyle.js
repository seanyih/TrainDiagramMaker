/*
	The OuDia look (SETTINGS.oudiaStyle), drawn by drawDiagram() / drawTrain() / placeTrainNumbers():
	three levels of time lines and two of station lines in the axis color, train numbers from the origin, stop marks.
*/

// OuDia's time scales (CDcdDiagram::m_arVline): minutes between the dotted, thin and bold lines
const OUDIA_TIME_SCALES = [[1, 5, 30], [2, 10, 60], [5, 10, 60], [10, 30, 60], [15, 15, 60], [20, 20, 60], [30, 30, 60], [60, 60, 60]];

function oudiaLine(bold, type = "solid"){
	const { axisColor, lineWidth } = SETTINGS.oudiaStyle;
	return { width: bold ? lineWidth*2 : lineWidth, color: axisColor, type: type };
}

// the time lines inside the plot; the bold ones count as primary time lines for avoidance, the thin ones as secondary
function drawOudiaTimeLines(o, grid, w, h){
	const { margin, startSec, endSec, pxPerMin } = SETTINGS;
	const [dotted, thin, bold] = OUDIA_TIME_SCALES[SETTINGS.oudiaStyle.timeScale].map(min => min*60);
	for(let t = Math.ceil(startSec/dotted)*dotted; t < endSec; t += dotted){
		if(t == startSec) continue;
		const x = (t - startSec)/60*pxPerMin + margin.left;
		const level = (t % bold == 0) ? "bold" : (t % thin == 0) ? "thin" : "dotted";
		const el = makeStyledLine(x, x, margin.top, h + margin.top, oudiaLine(level == "bold", level == "dotted" ? "dotted" : "solid"));
		setAttrs(el, {id:`timeline-${timeId(t)}`, class:`timeline ${level}`, "data-sec":t});
		o.append(el);
		if(level != "dotted" && shouldAvoidTimeLine(level == "bold")) addSegment(grid, {x1:x, y1:margin.top, x2:x, y2:h + margin.top, owner:"timeline"});
	}
}

// major stations bold, secondary ones (OuDia's 一般駅) thin
function oudiaStationLine(secondary){
	return oudiaLine(!secondary);
}

// a stop (not a pass) shorter than a minute, or with its arrival unknown: OuDia's 停車駅明示
function isBriefStop(stop){
	if(!stop.arrival) return true;
	return stop.arrival != stop.departure && (toSec(stop.departure) - toSec(stop.arrival) + 86400) % 86400 < 60;
}

function makeStopMark(x, y){
	const r = SETTINGS.oudiaStyle.lineWidth*2.5;
	return makeSVG("circle", {cx:x, cy:y, r:r, fill:"none", stroke:"#000000", "stroke-width":SETTINGS.oudiaStyle.lineWidth, class:"stop-mark"});
}

// the text placed on a train line
function trainLabel(train){
	const name = SETTINGS.oudiaStyle.enabled && SETTINGS.oudiaStyle.showTrainName ? train.settings.train_name : "";
	return [train.train_number, name].filter(s => s).join(" ");
}
