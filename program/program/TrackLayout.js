/*
	Track types of stations and sections, see icon/route/鐵道配置圖.md.
	A track is stored as its type string, e.g. "double.1".
*/

const TRACK_TYPES = ["single", "double.0", "double.1", "double.2", "double.3", "triple.1", "triple.2", "triple.3", "quadruple"];
const TRACK_LINES = ["single", "double", "triple", "quadruple"];

// transition image between two tracks: row = upper track, column = lower track, in TRACK_TYPES order.
// "" = use the mirrored entry flipped vertically
const TRACK_TRANSITIONS = [
	["1-1", "1-2", "1-2",   "1-2",   "1-2",   "1-3R",   "1-3L",   "1-3L",    "1-4"],
	["",    "2-2", "2-2-1", "2-2-2", "2-2-3", "2-3R",   "2-3L",   "2-3L-1",  "2-4"],
	["",    "",    "2-2",   "2-2-2", "2-2-2", "2-3R-2", "2-3L-2", "2-3L-1",  "2-4-2"],
	["",    "",    "",      "2-2",   "2-2-1", "2-3R-1", "2-3L-1", "2-3L-1",  "2-4-1"],
	["",    "",    "",      "",      "2-2",   "2-3R-3", "2-3L-3", "2-3L-3",  "2-4-3"],
	["",    "",    "",      "",      "",      "3R-3R",  "3R-3L",  "3R-3L-1", "3R-4"],
	["",    "",    "",      "",      "",      "",       "3L-3L",  "3L-3L-1", "3L-4"],
	["",    "",    "",      "",      "",      "",       "",       "3L-3L",   "3L-4-2"],
	["",    "",    "",      "",      "",      "",       "",       "",        "4-4"]
];

// [station, section]
const TRACK_PRESETS = {
	single:       ["double.3", "single"],
	double:       ["double.3", "double.0"],
	doubleSingle: ["double.3", "double.3"],
	unlimited:    ["quadruple", "quadruple"]
};

// "double.1" -> { lines: 2, bits: 1 }. bits: which bounds can overtake (1 = bound 1, 2 = bound 2, 3 = both)
function parseTrack(track){
	const [name, bits] = track.split(".");
	return {
		lines: TRACK_LINES.indexOf(name) + 1,
		bits: (bits === undefined) ? (name == "quadruple" ? 3 : 0) : Number(bits)
	};
}

function makeTrack(lines, bits){
	if(lines == 1) return "single";
	if(lines == 4) return "quadruple";
	if(lines == 3 && bits == 0) bits = 3; // triple: at least one bound can overtake
	return `${TRACK_LINES[lines - 1]}.${bits}`;
}

// upper track -> lower track
function trackTransition(from, to){
	const i = TRACK_TYPES.indexOf(from);
	const j = TRACK_TYPES.indexOf(to);
	return (i <= j) ? { file: TRACK_TRANSITIONS[i][j], flip: false } : { file: TRACK_TRANSITIONS[j][i], flip: true };
}

// max speeds are kept
function applyTrackPreset(name){
	const [station, section] = TRACK_PRESETS[name];
	ROUTE.track_layout.stations.fill(station);
	ROUTE.track_layout.sections.fill(section);
}

// seconds to run section i at its max speed; null if the speed or a kilo is missing
function minRunSec(i){
	const speed = ROUTE.track_layout.max_speeds[i];
	const from = ROUTE.stations[i].kilo;
	const to = ROUTE.stations[i + 1].kilo;
	if(speed === null || from === null || to === null || to <= from) return null;
	return Math.round((to - from) / speed * 3600);
}
