/*
	Below are variables that is adjustable by users.
	Fields bound to the setting page via data-setting="path" (see OutputSetting.js).
*/

const SETTINGS = {
	defaultStopSec: 60,
	startSec: 0,
	endSec: 86400,
	pxPerKm: 25,
	pxPerMin: 25,
	stationRange: { start: 0, end: null }, // route station indices drawn; end null = the last station
	trainLineWidth: 2, //px
	trainLineWidthByColor: [null, null, null, null, null, null, null, null, null, null, null], // index = train_color; null = trainLineWidth
	trainLineType: "solid",
	trainLineTypeByColor: ["", "", "", "", "", "", "", "", "", "", ""], // "" = trainLineType; a train's own settings.line_width / line_type come first

	// train number: color follows the train line
	showTrainNumber: true,
	trainNumberFontSize: 20,
	pxPerTrainNumber: 750,                 // one number per this much travel (px, vertical)
	minStationIntervalForTrainNumber: 70,  // px; shorter station intervals get no number
	trainNumberAvoidance: {
		enabled: true,              // off: numbers may overlap anything
		primaryTimeLines: false,
		secondaryTimeLines: false,  // only when lines.secondary.interval * pxPerMin >= MIN_PX_TO_AVOID_SECONDARY_LINES
		margin: 5                   // px, 0 ~ 20
	},

	// the OuDia look (OudiaStyle.js): its time and station lines, train numbers from the origin, stop marks
	oudiaStyle: {
		enabled: false,
		timeScale: 1,           // index of OUDIA_TIME_SCALES
		axisColor: "#C0C0C0",   // time and station lines
		lineWidth: 1,           // px; bold lines are twice as wide
		stopMarks: true,        // a circle at stops shorter than a minute
		showTrainName: false    // the train name after the number
	},

	// svg structure (Graphing.js)
	connectTrainLines: true,      // each train is one polyline (per day it is drawn on), not a line per segment
	layers: {
		enabled: false,           // group the drawing into named layers (Inkscape / Illustrator), LAYERS
		trainByDirection: false,  // the train lines in sublayers: 順行 / 逆行
		trainByColor: false       // ... by train_color (inside the direction ones if both)
	},

	// from the plot outline to the image edge
	margin: {
		left: 100,
		right: 100,
		top: 100,
		bottom: 100
	},
	background: {
		transparent: false,
		color: "#FFFFFF"
	},
	// type: "solid" | "dashed" | "dotted"
	lines: {
		station:   { width: 2, color: "#000000", type: "solid" },
		secondaryStation: { width: 1.4, color: "#808080", type: "solid" },      // ROUTE.topology.secondary
		primary:   { width: 2, color: "#000000", type: "solid" },               // every hour
		secondary: { width: 1.4, color: "#808080", type: "solid", interval: 10 }, // interval in minutes: 1, 5, 10, 15, 20, 30
		// dots on the other minutes, one per km from the top; width = diameter
		minute:    { enabled: false, width: 1.5, color: "#808080" },
		outline:   { top: 2, bottom: 2, left: 2, right: 2, color: "#000000" } // always solid
	},

	// gap: distance between text and the plot outline
	stationText: { fontSize: 20, color: "#000000", gap: 10 },
	aliasText: { show: false, fontSize: 20, color: "#000000", gap: 10 },
	secondaryStationText: { fontSize: 16, color: "#808080", gap: 10 },
	secondaryAliasText: { fontSize: 16, color: "#808080", gap: 10 }, // shown by aliasText.show
	timeLabel: {
		format: "standard",    // "standard" | "sized" | "simple"
		zeroPad: false,        // 08:00 or 8:00
		overDay: "plain",      // hours >= 24: "plain" (01:00) | "superscript" (01:00 +1) | "extended" (25:00)
		gap: 10,
		secondaryLabel: "none", // "none" | "hhmm" | "mm", only when lines.secondary.interval >= 10
		formats: {
			standard: { fontSize: 20, color: "#000000" },
			sized:    { hourFontSize: 25, hourColor: "#000000", minuteFontSize: 15, minuteColor: "#808080" },
			simple:   { fontSize: 20, color: "#000000" }
		}
	},

	// print mode (PrintLayout.js): px of the settings above are 1/ppi inch; lengths below are in mm
	print: {
		enabled: false,
		ppi: 300,
		page: { width: 210, height: 297 },
		bleed: { top: 3, bottom: 3, left: 3, right: 3 }, // added outside the page
		pageMinutes: 60,                                 // 30 | 60 | 120 | 180 | 240
		overlap: false,                                  // each page also draws 10 min before and after its range
		format: "pdf",                                   // "svg" | "pdf" | "svgPath": text kept as text | PDF, text as outlines | SVG, text as outlines
		// the plot's position: distance from the page edge on `side`, to the plot frame ("frame") or to the outermost text ("text")
		align: {
			v: { side: "top", base: "frame", offset: 20 },   // side: "top" | "bottom"
			h: { side: "left", base: "text", offset: 10 }    // side: "left" | "right"
		}
	},

	// restoring passing times from the track layout (PassingTime.js)
	passingTime: {
		solver: "stn",                 // "greedy" (PassingTime.js) | "stn" (PassingTimeSTN.js)
		minExtraPassingWaiting: 30,   // s; a stop longer than the station's stopsec + this may be a wait to be overtaken / met
		minTimeSeparation: 60,         // s; headway between two trains
		maxSearchDepth: 3,             // stations from a conflict to look for a waiting train
		maxIteration: 5,               // 0 = until no more progress
		maxAllowedConflict: 0,         // stop when this many conflicts or fewer remain
		estimatedSpeedLimitRatio: 1.1, // where no max speed is set: this times the fastest average speed through a section
		maxPassingPointIncrease: 2,    // more passing times of a train, to solve the conflicts its new one causes
		timeGranularity: 5,            // s; new passing times are multiples of this (auto-fill too)
		fineTune: false,               // restoring also fine-tunes the headways
		inaccurateArrival: false,      // all arrival times may move (otherwise only the blank ones)
		// the timetable's times are rounded (not with inaccurateArrival): each may be anywhere it was rounded from,
		// and every stop lasts at least minDwell, even one that looks like passing
		imprecise: false,
		timetableGranularity: 60,      // s, >= timeGranularity; the times were rounded to this (60: minutes)
		roundingMode: "auto",          // "round" | "floor" | "ceil" | "auto" (each of them, keeping the best)
		minDwell: 30,                  // s, >= timeGranularity
		smooth: true,                  // then even out the running times within where the times may be (smoothRuns())
		// a train from / to a branch passes where it joins at a time interpolated by distance (BranchTrain.js), which may move:
		interpolationSpeedRatio: 1.2,  // >= 1; the average speeds before and after the junction differ by at most this ratio
		interpolationMaxError: null,   // s, >= 0; if set, within this much of the interpolation instead
		// temporary stops a train may make where it has no stop in the timetable (e.g. a signal station):
		// { bound: 0 (both) | 1 | 2, number, color, name (null = any; number, name: wildcards),
		//   stations: "all" | "cross" | "overtake" | "station", station: name (for "station") }
		stopRules: []
	},

	// index = train_color
	trainColors: ["#4650E3","#4650E3","#25D9F2","#19F278","#9AF20B","#F28800","#F23F00","#DB06F2","#000000","#787878","#693600"]
};

// untouched copy; fields missing from an imported settings JSON fall back to these
const DEFAULT_SETTINGS = structuredClone(SETTINGS);
