// export route: csv or json
$("body").on("click", ".export-route-btn", function(){
	const fileName = $("#ExportRouteInfoFilename").val() || "RouteInfo";

	if($(this).data("format") == "json"){
		downloadFile(`${fileName}.json`, JSON.stringify(ROUTE, null, 4));
	}else{
		downloadFile(`${fileName}.csv`, getRouteDataCSV());
	}
});

// import route: csv or json, decided by file extension
$("body").on("click", "#ImportRouteInfoBtn", function(){
	const selected = readImportFile("#RouteInfoFile", (text, type) => {
		applyRoute((type == "json") ? loadRouteFromJSON(text) : loadRouteFromCSV(text));
		$("#ImportRouteSuccess").toast('show');
		generateTimetable();
	});
	if(!selected) $("#ImportRouteFailed").toast('show');
});

function applyRoute(route){
	route.stations[0].kilo = 0;
	ROUTE.route_name = route.route_name;
	ROUTE.stations = route.stations;
	ROUTE.track_layout = route.track_layout;
	ROUTE.topology = route.topology;
	renderRouteTable();
}

function getRouteDataCSV(){
	return ROUTE.stations
		.map(station => `${station.name},${station.kilo ?? ""},${station.stopsec},${station.alias}`)
		.join("\n");
}

// name,kilo[,stopsec][,alias]
function loadRouteFromCSV(text){
	const stations = parseCSV(text).map(cells => {
		const kilo = parseFloat(cells[1]);
		const stopsec = parseInt(cells[2]);
		return newStation(
			cells[0].trim(),
			isNaN(kilo) ? null : kilo,
			isNaN(stopsec) ? SETTINGS.defaultStopSec : stopsec,
			(cells[3] ?? "").trim()
		);
	});
	// csv has no track layout or topology: reset them
	return {
		route_name: ROUTE.route_name,
		stations: stations,
		track_layout: newTrackLayout(stations.length),
		topology: newTopology(stations.length)
	};
}

function loadRouteFromJSON(text){
	const data = JSON.parse(text);
	return {
		route_name: data.route_name ?? "",
		stations: data.stations.map(s => newStation(s.name, s.kilo, s.stopsec ?? SETTINGS.defaultStopSec, s.alias ?? "")),
		track_layout: loadTrackLayout(data.track_layout, data.stations.length),
		topology: loadTopology(data.topology, data.stations.length)
	};
}
