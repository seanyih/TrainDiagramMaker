/*
	Route, both timetables and settings in one json, for moving everything at once.
	Each part has the same format as its own export, and is read by the same loader.
*/

$("body").on("click", ".export-all-btn", function(){
	const fileName = $("#ExportAllFilename").val() || "AllData";
	downloadFile(`${fileName}.json`, JSON.stringify(getAllDataJSON(), null, 4));
});

$("body").on("click", "#ImportAllBtn", function(){
	const selected = readImportFile("#AllFile", text => {
		try{
			loadAllFromJSON(text);
		}catch(e){
			$("#ImportAllFailed").toast('show');
			return;
		}
		$("#ImportAllSuccess").toast('show');
		generateTimetable();
	});
	if(!selected) $("#ImportAllFailed").toast('show');
});

function getAllDataJSON(){
	return {
		route: ROUTE,
		trains: { 1: getTrainDataJSON(1), 2: getTrainDataJSON(2) },
		settings: SETTINGS
	};
}

// missing settings use the defaults; a missing route / bound keeps the current one.
// a broken file changes nothing
function loadAllFromJSON(text){
	const data = JSON.parse(text);
	const part = value => JSON.stringify(value);

	// settings go first: route stopsec falls back to the imported defaultStopSec
	const previous = structuredClone(SETTINGS);
	applySettings(loadSettingsFromJSON(part(data.settings ?? {})));

	let route, trains;
	try{
		route = data.route ? loadRouteFromJSON(part(data.route)) : null;
		trains = [1, 2].map(bound => data.trains?.[bound] ? loadTrainFromJSON(part(data.trains[bound])) : null);
	}catch(e){
		applySettings(previous);
		throw e;
	}

	if(route) applyRoute(route);
	[1, 2].forEach((bound, i) => {
		if(trains[i]) applyTrains(bound, trains[i], false);
	});
}
