function renderRouteTable(){
	const rows = ROUTE.stations.map((station, i) => {
		const kiloCell = (i == 0)
			? `<div>0.0</div>`
			: `<input class="in-table-text-input" data-index="${i}" data-field="kilo" value="${station.kilo ?? ""}">`;

		return `
			<tr>
				<td class="staTableButtonCol">
					<div class="circle-button-add addstation" style="margin-right: 15px" data-index="${i}"></div>
					<div class="circle-button-minus ${i == 0 ? "" : "deletestation"}" data-index="${i}"></div>
				</td>
				<td><input class="in-table-text-input highlight-input-cell" data-index="${i}" data-field="name" value="${escapeHTML(station.name)}"></td>
				<td>${kiloCell}</td>
				<td><input class="in-table-text-input" data-index="${i}" data-field="stopsec" value="${station.stopsec}"></td>
				<td><input class="in-table-text-input" data-index="${i}" data-field="alias" value="${escapeHTML(station.alias)}"></td>
			</tr>`;
	});
	$("#RouteInfotbody").html(rows.join(""));
	renderTrackTable();
	renderTopologyTable();
}

// station names / order changed: keep stops and timetable rows in sync
function onRouteChanged(){
	refreshStopNames();
	renderStopRules();
	refreshTimetable(1);
	refreshTimetable(2);
}

$("#RouteInfotbody").on("click", ".addstation", function(){
	insertStation($(this).data("index") + 1);
	renderRouteTable();
	onRouteChanged();
});

$("#RouteInfotbody").on("click", ".deletestation", function(){
	deleteStation($(this).data("index"));
	renderRouteTable();
	onRouteChanged();
});

$("#RouteInfotbody").on("change", "input", function(){
	const station = ROUTE.stations[$(this).data("index")];
	const field = $(this).data("field");
	const value = $(this).val().trim();

	if(field == "kilo" || field == "stopsec"){
		const number = (field == "kilo") ? parseFloat(value) : parseInt(value);
		if(value != "" && isNaN(number)){
			$(this).css("background-color", "red");
			return;
		}
		$(this).css("background-color", "");
		if(field == "kilo") station.kilo = (value == "") ? null : number;
		else                station.stopsec = (value == "") ? SETTINGS.defaultStopSec : number;
		$(this).val(station[field] ?? "");
	}else{
		station[field] = value;
	}

	if(field == "name") onRouteChanged();
	if(field == "name" || field == "kilo"){
		renderTrackTable();
		renderTopologyTable();
	}
});
