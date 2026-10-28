let editingTrain = null;
let editingBound = null;
let editingOptionBar = null;

// origin / terminal: the station's time field
const BRANCH_TIME_FIELDS = { origin: "departure", terminal: "arrival" };

$(".timetable").on("click", ".optionbar", function(){
	editingBound = tableBound(this);
	editingTrain = TRAINS[editingBound][$(this).data("train")];
	editingOptionBar = $(this);

	$("#offcanvas-train-id").html(escapeHTML(editingTrain.train_number));
	$("#offcanvas-train-name").val(editingTrain.settings.train_name);
	$("#offcanvas-train-color").val(editingTrain.settings.train_color);
	styleColorSelect(editingTrain.settings.train_color);
	["origin", "terminal"].forEach(renderBranchEnd);
	$("#timetable-offcanvas").offcanvas("show");
});

// the branch stations it may start from (end at); a chosen one that no longer may is kept, marked
function renderBranchEnd(end){
	const data = editingTrain[end];
	const valid = new Set(branchChoices(editingTrain, editingBound, end).map(s => s.name));
	const names = [...valid];
	if(data.station_name && !valid.has(data.station_name)) names.push(data.station_name);
	const options = names.map(name => {
		const label = valid.has(name) ? name : `${name} (不適用)`;
		return `<option value="${escapeHTML(name)}" ${name == data.station_name ? "selected" : ""}>${escapeHTML(label)}</option>`;
	});
	$(`#offcanvas-${end}`).html([`<option value="">無</option>`, ...options].join(""));
	$(`#offcanvas-${end}-time`)
		.val(data[BRANCH_TIME_FIELDS[end]])
		.css("background-color", "")
		.attr("placeholder", `${data.station_name || (end == "origin" ? "始發站" : "終點站")}${end == "origin" ? "發" : "到"}`);
}

$(".offcanvas-branch").on("change", function(){
	const end = $(this).data("end");
	editingTrain[end].station_name = $(this).val();
	renderBranchEnd(end);
});

$(".offcanvas-branch-time").on("change", function(){
	const time = normalizeTime($(this).val());
	if(time === null){
		$(this).css("background-color", "red");
		return;
	}
	const end = $(this).data("end");
	editingTrain[end][BRANCH_TIME_FIELDS[end]] = time;
	$(this).css("background-color", "").val(time);
});

function styleColorSelect(color, element = $("#offcanvas-train-color")){
	if(color == 0){
		element.css("background-color", "#FFF");
		element.css("color", "#000");
	}else{
		element.css("background-color", `var(--color${color})`);
		element.css("color", `var(--color${color})`);
	}
}

$("#offcanvas-train-color").on("change", function(){
	const color = parseInt($(this).val());
	editingTrain.settings.train_color = color;
	styleColorSelect(color);
	editingOptionBar.css("background-color", `var(--color${color})`);
});

$("#offcanvas-train-name").on("change", function(){
	editingTrain.settings.train_name = $(this).val();
});
