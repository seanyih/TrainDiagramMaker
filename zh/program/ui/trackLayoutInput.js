const TRACK_LINE_NAMES = ["單線", "複線", "三線", "四線"];

// one row per station and per section, top to bottom
function renderTrackTable(){
	const layout = ROUTE.track_layout;
	const rows = [];
	ROUTE.stations.forEach((station, i) => {
		rows.push({ list: "stations", index: i, track: layout.stations[i], label: `${escapeHTML(station.name)} ${station.kilo ?? ""}` });
		if(i < layout.sections.length) rows.push({ list: "sections", index: i, track: layout.sections[i], label: "", speed: layout.max_speeds[i] });
	});
	$("#TrackLayouttbody").html(rows.map((row, r) => trackRowHTML(row, rows[r + 1])).join(""));

	$("#TrackSpeedAll").val(layout.max_speed_all ?? "").prop("disabled", !layout.max_speed_enabled);
	$("#TrackSpeedAllDisabled").prop("checked", !layout.max_speed_enabled);
}

function trackRowHTML(row, next){
	const { lines, bits } = parseTrack(row.track);
	const image = (row.list == "stations") ? `${row.track}.sta` : row.track;

	let transition = "";
	if(next){
		const { file, flip } = trackTransition(row.track, next.track);
		transition = `<img class="track-transition ${flip ? "flip" : ""}" src="../icon/route/${file}.svg">`;
	}

	const options = TRACK_LINE_NAMES.map((name, i) => `<option value="${i + 1}" ${lines == i + 1 ? "selected" : ""}>${name}</option>`);

	// double / triple: which bounds can overtake
	const checks = (lines == 2 || lines == 3) ? [1, 2].map(bound => {
		const id = `track-${row.list}-${row.index}-${bound}`;
		return `
			<div class="form-check form-check-inline">
				<input type="checkbox" class="form-check-input" id="${id}" data-bound="${bound}" ${bits & bound ? "checked" : ""}>
				<label class="form-check-label" for="${id}">${bound == 1 ? "順行" : "逆行"}可追越</label>
			</div>`;
	}) : [];

	return `
		<tr data-list="${row.list}" data-index="${row.index}">
			<td class="track-image-col"><div class="track-image"><img class="track-main" src="../icon/route/${image}.svg">${transition}</div></td>
			<td class="track-name">${row.label}</td>
			<td>
				<div class="aic">
					<select class="form-select form-select-sm track-lines">${options.join("")}</select>
					${checks.join("")}
				</div>
			</td>
			<td>${(row.list == "sections" && ROUTE.track_layout.max_speed_enabled) ? `
				<div class="aic">
					<input class="form-control form-control-sm track-speed" inputmode="decimal" placeholder="最高速度" value="${row.speed ?? ""}">
					<label class="col-form-label">km/h</label>
					<label class="col-form-label track-run-time-label">最短運轉時間</label>
					<span class="track-run-time">${formatRunTime(minRunSec(row.index))}</span>
				</div>` : ""}
			</td>
		</tr>`;
}

// 152 -> "2m32s"
function formatRunTime(sec){
	return (sec === null) ? "" : `${Math.floor(sec / 60)}m${String(sec % 60).padStart(2, "0")}s`;
}

// returns the speed (null if empty), or false if rejected
function readSpeedInput(input){
	const value = $(input).val().trim();
	const speed = Number(value);
	if(value != "" && !(speed > 0)){
		$(input).css("background-color", "red");
		return false;
	}
	$(input).css("background-color", "");
	if(value != "" && speed < 10) $("#LowSpeedWarning").toast('show');
	return (value == "") ? null : speed;
}

$("#TrackLayouttbody").on("change", ".track-speed", function(){
	const speed = readSpeedInput(this);
	if(speed === false) return;
	const row = $(this).closest("tr");
	ROUTE.track_layout.max_speeds[row.data("index")] = speed;
	row.find(".track-run-time").text(formatRunTime(minRunSec(row.data("index"))));
});

// fills every section
$("body").on("change", "#TrackSpeedAll", function(){
	const speed = readSpeedInput(this);
	if(speed === false) return;
	ROUTE.track_layout.max_speed_all = speed;
	if(speed !== null) ROUTE.track_layout.max_speeds.fill(speed);
	renderTrackTable();
});

// checked: no max speeds at all
$("body").on("change", "#TrackSpeedAllDisabled", function(){
	const layout = ROUTE.track_layout;
	layout.max_speed_enabled = !$(this).prop("checked");
	if(!layout.max_speed_enabled){
		layout.max_speed_all = null;
		layout.max_speeds.fill(null);
		$("#TrackSpeedAll").css("background-color", "");
	}
	renderTrackTable();
});

$("#TrackLayouttbody").on("change", ".track-lines", function(){
	const row = $(this).closest("tr");
	const list = ROUTE.track_layout[row.data("list")];
	const index = row.data("index");
	list[index] = makeTrack(Number($(this).val()), parseTrack(list[index]).bits);
	renderTrackTable();
});

$("#TrackLayouttbody").on("change", "input[type=checkbox]", function(){
	const row = $(this).closest("tr");
	const list = ROUTE.track_layout[row.data("list")];
	const index = row.data("index");
	const { lines, bits } = parseTrack(list[index]);
	const bound = $(this).data("bound");
	const newBits = $(this).prop("checked") ? (bits | bound) : (bits & ~bound);

	// triple: at least one bound can overtake
	if(lines == 3 && newBits == 0){
		$(this).prop("checked", true);
		return;
	}
	list[index] = makeTrack(lines, newBits);
	renderTrackTable();
});

$("body").on("click", ".track-preset-btn", function(){
	applyTrackPreset($(this).data("preset"));
	renderTrackTable();
});
