function checkkilo(){
	let prev = 0;
	for(let i = 1; i < ROUTE.stations.length; i++){
		const kilo = ROUTE.stations[i].kilo;
		const input = $(`#RouteInfotbody input[data-field="kilo"][data-index="${i}"]`);
		if(kilo === null){
			input.css("background-color", "red");
			$("#GenerateTimetableFailedReason").html("有缺失的里程值");
			return true;
		}
		if(kilo <= prev){
			input.css("background-color", "red");
			$("#GenerateTimetableFailedReason").html("有不合理的里程值");
			return true; //intercept the generation
		}
		input.css("background-color", "");
		prev = kilo;
	}
	return false;
}

function generateTimetable(){
	if(checkkilo()){
		$("#GenerateTimetableFailed").toast('show');
		return;
	}
	onRouteChanged();
	$("#GenerateTimetableSuccess").toast('show');
}

$("#GenerateTimetableBtn").on("click", function(){
	generateTimetable();
});

const timetableDirty = { 1: false, 2: false };

// render now if the table is shown, otherwise when its tab is opened
function refreshTimetable(bound){
	if($(`#container-timetable-${bound}`)[0].style.display == "none") timetableDirty[bound] = true;
	else renderTimetable(bound);
}

// arrival == departure means the train passes the station
function isPassingStop(stop){
	return !!stop && stop.arrival !== "" && stop.arrival === stop.departure;
}

function renderTimetable(bound){
	timetableDirty[bound] = false;
	const stations = boundStations(bound);
	const trains = TRAINS[bound];

	const buttonCells = trains.map((train, t) => `
		<th colspan="2" class="timetable-btn-th">
			<div class="aic jcc full">
				<div class="circle-button-add addtrain" style="margin-right: 15px" data-train="${t}"></div>
				<div class="circle-button-minus ${t == 0 ? "" : "deletetrain"}" data-train="${t}"></div>
			</div>
		</th>`);

	const numberCells = trains.map((train, t) => `
		<th colspan="2">
			<input class="in-table-text-input highlight-input-cell train-number" data-train="${t}" value="${escapeHTML(train.train_number)}" placeholder="車次">
		</th>`);

	$(`#timetablehead-${bound}`).html(`
		<tr>
			<th rowspan="2" style="vertical-align: middle; font-size:125%; "><p style="display:inline-block;">基本資料</p></th>
			${buttonCells.join("")}
		</tr>
		<tr>${numberCells.join("")}</tr>`);

	const optionCells = trains.map((train, t) => `
		<td colspan="2" class="optionbar" data-train="${t}" style="background-color: var(--color${train.settings.train_color})"></td>`);

	$(`#timetable-optionbar-${bound}`).html(`<tr class="deco-row"><td></td>${optionCells.join("")}</tr>`);

	// stopAt[t][order] = stop
	const stopAt = trains.map(train => {
		const arr = [];
		train.timetable.forEach(stop => arr[stop.station_order] = stop);
		return arr;
	});

	const rows = stations.map((station, s) => {
		const name = escapeHTML(station.name);
		const cells = trains.map((train, t) => {
			const stop = stopAt[t][s];
			const passing = (isPassingStop(stop) ? " passing-time-input" : "") + (stop?.pinned ? " pinned-time-input" : "");
			return `
				<td><input class="in-table-text-input time-input${passing}" data-train="${t}" data-station="${s}" data-field="arrival" value="${stop ? stop.arrival : ""}"></td>
				<td class="td-dep"><input class="in-table-text-input time-input${passing}" data-train="${t}" data-station="${s}" data-field="departure" value="${stop ? stop.departure : ""}" placeholder="${name}發"></td>`;
		});
		return `
			<tr class="timetable-station-row">
				<td class="stanamelabel">${name}</td>
				${cells.join("")}
			</tr>`;
	});

	$(`#timetablebody-${bound}`).html(rows.join(""));
}
