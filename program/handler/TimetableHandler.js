// export trains: data-format = "csv-dep" (departure only) | "csv" (arrival + departure) | "json"
$("body").on("click", ".export-train-btn", function(){
	const bound = $(this).data("bound");
	const format = $(this).data("format");
	const fileName = $(this).siblings("input").val() || (format == "csv-dep" ? "DepartureTime" : "DepartureArrivalTime");

	if(format == "json"){
		downloadFile(`${fileName}.json`, JSON.stringify(getTrainDataJSON(bound), null, 4));
	}else{
		downloadFile(`${fileName}.csv`, getTrainDataCSV(bound, format == "csv"));
	}
});

// import trains: json by file extension, otherwise csv with/without arrival times (data-arrival)
$("body").on("click", ".import-train-btn", function(){
	const bound = $(this).data("bound");
	const arrival = $(this).data("arrival");

	const selected = readImportFile($(this).siblings("input"), (text, type) => {
		const trains = (type == "json") ? loadTrainFromJSON(text) : loadTrainFromCSV(text, arrival);
		applyTrains(bound, trains, $("#ImportTrainMode").val() == "a");
		$(`#ImportTime${bound}Success`).toast('show');
	});
	if(!selected) $("#ImportTimeFailed").toast('show');
});

// append = true: drop blank trains, then add after the existing ones
function applyTrains(bound, trains, append){
	if(append){
		TRAINS[bound] = TRAINS[bound].filter(train => !isBlankTrain(train)).concat(trains);
	}else{
		TRAINS[bound] = trains;
	}
	refreshStopNames();
	refreshTimetable(bound);
}

function getTrainDataJSON(bound){
	const stations = boundStations(bound);
	return {
		route_name: ROUTE.route_name,
		bound: bound,
		station_count: stations.length,
		station_record: stations.map(station => station.name),
		train_count: TRAINS[bound].length,
		timetable: TRAINS[bound]
	};
}

function loadTrainFromJSON(text){
	const data = JSON.parse(text);
	if(!ROUTE.route_name) ROUTE.route_name = data.route_name ?? "";

	return data.timetable.map(t => {
		const train = newTrain(t.train_number ?? "", t.settings?.train_name ?? "", parseInt(t.settings?.train_color) || 0);
		t.timetable.forEach(stop => {
			addStop(train, stop.station_order, normalizeTime(stop.arrival ?? "") || "", normalizeTime(stop.departure ?? "") || "");
		});
		return train;
	});
}

/*
	CSV layout (one train per column, or two columns [arrival, departure] when arrival = true):
	row 0:              train number
	row 1 ~ N:          times at each station, in the order of this bound
	row N+1 (optional): train name
	row N+2 (optional): train color
*/
function loadTrainFromCSV(text, arrival){
	const rows = parseCSV(text);
	const stationCount = ROUTE.stations.length;
	const step = arrival ? 2 : 1;
	const nameRow = rows[stationCount + 1];
	const colorRow = rows[stationCount + 2];

	const trains = [];
	for(let col = 0; col < rows[0].length; col += step){
		const train = newTrain(rows[0][col].trim(), (nameRow?.[col] ?? "").trim(), parseInt(colorRow?.[col]) || 0);

		for(let s = 0; s < stationCount; s++){
			const cells = rows[s + 1] ?? [];
			const arr = arrival ? normalizeTime(cells[col] ?? "") || "" : "";
			const dep = normalizeTime(cells[col + step - 1] ?? "") || "";
			addStop(train, s, arr, dep);
		}
		trains.push(train);
	}
	return trains;
}

function getTrainDataCSV(bound, arrival){
	const trains = TRAINS[bound];
	const pad = arrival ? [""] : [];

	const rows = [trains.flatMap(train => [train.train_number, ...pad])];
	for(let s = 0; s < ROUTE.stations.length; s++){
		rows.push(trains.flatMap(train => {
			const stop = findStop(train, s);
			const dep = stop ? stop.departure : "";
			return arrival ? [stop ? stop.arrival : "", dep] : [dep];
		}));
	}
	rows.push(trains.flatMap(train => [train.settings.train_name, ...pad]));
	rows.push(trains.flatMap(train => [train.settings.train_color, ...pad]));

	return rows.map(row => row.join(",")).join("\n");
}
