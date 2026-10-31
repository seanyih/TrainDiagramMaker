/*
	基本資料 (first), route, both timetables and settings in one json, for moving everything at once.
	Each part has the same format as its own export, and is read by the same loader.
	With several operation modes, "trains" has every distinct train once and "opmodes" lists each mode's trains by index.
*/

$("body").on("click", ".export-all-btn", function(){
	const fileName = $("#ExportAllFilename").val() || "AllData";
	downloadFile(`${fileName}.json`, JSON.stringify(getAllDataJSON($("#ExportAllOpmodes").val() == "all"), null, 4));
});

// lists the file's operation modes to choose from
$("body").on("change", "#AllFile", function(){
	$("#AllOpmodeGroup").hide();
	readImportFile(this, text => {
		let modes;
		try{
			modes = JSON.parse(text).opmodes;
		}catch(e){
			return;
		}
		if(!Array.isArray(modes) || modes.length == 0) return;
		const options = modes.map((mode, i) => {
			const name = opmodeName({ title: String(mode.title ?? ""), days: loadOpmodeDays(mode.days) }, i);
			return `<option value="${i}">${escapeHTML(name)}${mode.description ? ` (${escapeHTML(mode.description)})` : ""}</option>`;
		});
		$("#AllOpmode").html([`<option value="all">全部 (${modes.length} 個運行型態)</option>`, ...options].join(""));
		$("#AllOpmodeGroup").show();
	});
});

$("body").on("click", "#ImportAllBtn", function(){
	const only = $("#AllOpmodeGroup").is(":visible") && $("#AllOpmode").val() != "all" ? Number($("#AllOpmode").val()) : null;
	const selected = readImportFile("#AllFile", text => {
		try{
			loadAllFromJSON(text, only);
		}catch(e){
			$("#ImportAllFailed").toast('show');
			return;
		}
		$("#ImportAllSuccess").toast('show');
		generateTimetable();
	});
	if(!selected) $("#ImportAllFailed").toast('show');
});

// all = false: only the current operation mode
function getAllDataJSON(all = true){
	const modes = all ? OPMODES : [OPMODES[currentOpmode]];
	const plain = modes.length == 1 && !modes[0].title && !modes[0].description && modes[0].days.length == 0;
	if(plain){
		return {
			info: INFO,
			route: ROUTE,
			trains: { 1: getTrainDataJSON(1, modes[0].trains[1]), 2: getTrainDataJSON(2, modes[0].trains[2]) },
			settings: SETTINGS
		};
	}

	const pool = { 1: [], 2: [] };
	const index = { 1: new Map(), 2: new Map() };
	const opmodes = modes.map(mode => ({
		title: mode.title,
		description: mode.description,
		days: mode.days,
		trains: Object.fromEntries([1, 2].map(bound => [bound, mode.trains[bound].map(train => {
			const key = JSON.stringify(train);
			if(!index[bound].has(key)){
				index[bound].set(key, pool[bound].length);
				pool[bound].push(train);
			}
			return index[bound].get(key);
		})]))
	}));
	return {
		info: INFO,
		route: ROUTE,
		trains: { 1: getTrainDataJSON(1, pool[1]), 2: getTrainDataJSON(2, pool[2]) },
		opmodes: opmodes,
		settings: SETTINGS
	};
}

function loadOpmodeDays(days){
	return Array.isArray(days) ? OPMODE_DAYS.filter(day => days.includes(day)) : [];
}

// the operation modes of a file, each with copies of the trains it lists; only = the index of the one to load, or null
function loadOpmodes(list, pool, only){
	return list.filter((mode, i) => only === null || i == only).map(mode => {
		const trains = {};
		[1, 2].forEach((bound, b) => {
			const indices = Array.isArray(mode.trains?.[bound]) ? mode.trains[bound] : [];
			trains[bound] = indices.filter(i => pool[b]?.[i]).map(i => structuredClone(pool[b][i]));
		});
		return newOpmode(trains, String(mode.title ?? ""), String(mode.description ?? ""), loadOpmodeDays(mode.days));
	});
}

// missing settings use the defaults, missing 基本資料 is blank; a missing route / bound keeps the current one. the file's operation modes
// (only = the index of one, or null for all), or a file with trains but none, replace every mode.
// a broken file changes nothing
function loadAllFromJSON(text, only = null){
	const data = JSON.parse(text);
	const part = value => JSON.stringify(value);

	// settings go first: route stopsec falls back to the imported defaultStopSec
	const previous = structuredClone(SETTINGS);
	applySettings(loadSettingsFromJSON(part(data.settings ?? {})));

	let route, trains, opmodes = null;
	try{
		route = data.route ? loadRouteFromJSON(part(data.route)) : null;
		const stations = (route ?? ROUTE).stations;
		trains = [1, 2].map(bound => data.trains?.[bound] ? loadTrainFromJSON(part(data.trains[bound]), bound, (bound == 1) ? stations : stations.slice().reverse()) : null);
		if(Array.isArray(data.opmodes) && data.opmodes.length > 0) opmodes = loadOpmodes(data.opmodes, trains, only);
	}catch(e){
		applySettings(previous);
		throw e;
	}

	Object.keys(INFO).forEach(key => INFO[key] = String(data.info?.[key] ?? ""));
	if(route) applyRoute(route);
	if(opmodes) applyOpmodes(opmodes);
	else if(trains[0] || trains[1]) applyOpmodes([newOpmode({ 1: trains[0] ?? TRAINS[1], 2: trains[1] ?? TRAINS[2] })]);
}
