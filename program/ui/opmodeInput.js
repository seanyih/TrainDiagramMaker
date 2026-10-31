/*
	Operation modes (運行型態, DataStore.js): the mode bars above the timetables and the output (.opmode-select),
	the modal editing them (#OpmodeModal), and the modes having a train in 車次細項 (#offcanvas-opmodes)
*/

const OPMODE_DAY_NAMES = { mon: "一", tue: "二", wed: "三", thu: "四", fri: "五", sat: "六", sun: "日", hol: "假日" };

// 每日, 平日, 假日, or e.g. 週二至四、假日; "" for no days
function opmodeDaysName(days){
	const week = OPMODE_DAYS.slice(0, 7).map(day => days.includes(day));
	const hol = days.includes("hol");
	const key = week.map(Number).join("");
	if(key == "1111111") return "每日";
	if(key == "1111100" && !hol) return "平日";
	if(key == "0000011" && hol) return "假日";

	// runs of 3 days or more as 一至三
	const parts = [];
	for(let d = 0; d < 7; d++){
		if(!week[d]) continue;
		let end = d;
		while(end + 1 < 7 && week[end + 1]) end++;
		const name = k => OPMODE_DAY_NAMES[OPMODE_DAYS[k]];
		if(end - d >= 2) parts.push(`${name(d)}至${name(end)}`);
		else for(let k = d; k <= end; k++) parts.push(name(k));
		d = end;
	}
	const weekName = parts.length ? `週${parts.join("、")}` : "";
	return [weekName, hol ? OPMODE_DAY_NAMES.hol : ""].filter(Boolean).join("、");
}

// its title, or a name from its days
function opmodeName(mode, i){
	return mode.title || opmodeDaysName(mode.days) || `運行型態 ${i + 1}`;
}

function renderOpmodeSelects(){
	$(".opmode-select").html(OPMODES.map((mode, i) => `<option value="${i}" ${i == currentOpmode ? "selected" : ""}>${escapeHTML(opmodeName(mode, i))}</option>`).join(""));
}

function switchOpmode(i){
	selectOpmode(i);
	onOpmodeChanged();
}

function onOpmodeChanged(){
	renderOpmodeSelects();
	renderOpmodeTable();
	refreshTimetable(1);
	refreshTimetable(2);
	if($("#container-output").is(":visible") && $("#output").children().length > 0) $("#OutputBtn").click();
}

$("body").on("change", ".opmode-select", function(){
	switchOpmode(Number($(this).val()));
});

function renderOpmodeTable(){
	$("#OpmodeTableBody").html(OPMODES.map((mode, i) => `
		<tr data-mode="${i}">
			<td><input class="form-check-input opmode-current" type="radio" name="OpmodeCurrent" ${i == currentOpmode ? "checked" : ""} title="目前的運行型態"></td>
			<td><input class="form-control opmode-field" data-field="title" value="${escapeHTML(mode.title)}" placeholder="${escapeHTML(opmodeDaysName(mode.days) || `運行型態 ${i + 1}`)}"></td>
			<td>
				<div class="btn-group btn-group-sm text-nowrap">${OPMODE_DAYS.map(day => `
					<input type="checkbox" class="btn-check opmode-day" id="opmode-${i}-${day}" data-day="${day}" autocomplete="off" ${mode.days.includes(day) ? "checked" : ""}>
					<label class="btn btn-outline-primary" for="opmode-${i}-${day}">${OPMODE_DAY_NAMES[day]}</label>`).join("")}
				</div>
			</td>
			<td><textarea class="form-control opmode-field" data-field="description" rows="1">${escapeHTML(mode.description)}</textarea></td>
			<td class="text-nowrap">順行 ${mode.trains[1].length}<br>逆行 ${mode.trains[2].length}</td>
			<td><button type="button" class="btn btn-sm btn-outline-danger text-nowrap opmode-delete" ${OPMODES.length == 1 ? "disabled" : ""}>刪除</button></td>
		</tr>`).join(""));
}

$("body").on("show.bs.modal", "#OpmodeModal", renderOpmodeTable);

const opmodeRow = element => Number($(element).closest("tr").data("mode"));

$("body").on("change", ".opmode-field", function(){
	OPMODES[opmodeRow(this)][$(this).data("field")] = $(this).val().trim();
	renderOpmodeSelects();
});

$("body").on("change", ".opmode-day", function(){
	const row = $(this).closest("tr");
	OPMODES[opmodeRow(this)].days = OPMODE_DAYS.filter(day => row.find(`.opmode-day[data-day="${day}"]`).prop("checked"));
	renderOpmodeTable();
	renderOpmodeSelects();
});

$("body").on("change", ".opmode-current", function(){
	switchOpmode(opmodeRow(this));
});

$("body").on("click", ".opmode-add-btn", function(){
	switchOpmode(addOpmode($(this).data("copy")));
});

// the first click asks to confirm
$("body").on("click", ".opmode-delete", function(){
	if(!$(this).hasClass("btn-danger")){
		$(this).removeClass("btn-outline-danger").addClass("btn-danger").text("確定刪除");
		return;
	}
	deleteOpmode(opmodeRow(this));
	onOpmodeChanged();
});

// 車次細項: a mode has the train if it has a copy of it; checking copies it there, unchecking removes the copies
function renderTrainOpmodes(){
	$("#offcanvas-opmodes-box").toggle(OPMODES.length > 1);
	const key = trainKey(editingTrain);
	const number = editingTrain.train_number;
	$("#offcanvas-opmodes").html(OPMODES.map((mode, i) => {
		const trains = mode.trains[editingBound];
		const same = trains.find(train => trainKey(train) == key);
		const note = same?.hidden ? " (隱藏)" : (!same && number && trains.some(train => train.train_number == number)) ? " (另有同車次、時刻不同的列車)" : "";
		return `
			<div class="form-check">
				<input class="form-check-input offcanvas-opmode" type="checkbox" id="offcanvas-opmode-${i}" data-mode="${i}" ${same ? "checked" : ""} ${i == currentOpmode ? "disabled" : ""}>
				<label class="form-check-label" for="offcanvas-opmode-${i}">${escapeHTML(opmodeName(mode, i))}${note}</label>
			</div>`;
	}).join(""));
}

$("body").on("change", ".offcanvas-opmode", function(){
	const i = $(this).data("mode");
	if($(this).prop("checked")) copyTrainToOpmode(editingTrain, editingBound, i);
	else removeTrainFromOpmode(editingTrain, editingBound, i);
	renderTrainOpmodes();
});
