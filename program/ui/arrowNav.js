// Optional: arrow-key navigation for the route table and timetables. Remove its <script> tag to disable.

const ARROW_KEYS = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
const ARROW_DOUBLE_MS = 800;
let arrowEdge = { dir: "", time: 0 };

// true when this press is the second one at the edge in a row
function arrowEdgeRepeated(dir){
	const now = Date.now();
	const repeated = arrowEdge.dir == dir && now - arrowEdge.time < ARROW_DOUBLE_MS;
	arrowEdge = repeated ? { dir: "", time: 0 } : { dir, time: now };
	return repeated;
}

function arrowFocus($cell){
	if(!$cell.length) return;
	if(!$cell.is("input")) $cell.attr("tabindex", -1);
	$cell.focus();
	if($cell.is("input")) $cell.select();
}

// whether the caret allows leaving the cell sideways
function arrowCaretAtEdge(el, dir){
	if(!$(el).is("input")) return true;
	return dir == "left" ? el.selectionStart == 0 : el.selectionEnd == el.value.length;
}

// route table: cells are the tds after the button column
function routeCell(row, col){
	const $td = $("#RouteInfotbody > tr").eq(row).children("td").eq(col);
	const $input = $td.find("input");
	return $input.length ? $input : $td;
}

$("#RouteInfotbody").on("keydown", "input, td[tabindex]", function(e){
	const dir = ARROW_KEYS[e.key];
	if(!dir || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.originalEvent.isComposing) return;
	if((dir == "left" || dir == "right") && !arrowCaretAtEdge(this, dir)) return;

	const $td = $(this).closest("td");
	const row = $td.parent().index();
	const col = $td.index();
	const rows = ROUTE.stations.length;
	const next = {
		left: [row, col - 1], right: [row, col + 1], up: [row - 1, col], down: [row + 1, col]
	}[dir];

	e.preventDefault();
	if(next[0] < 0 || next[1] < 1 || next[1] > 4) return;
	if(next[0] >= rows){
		if(!arrowEdgeRepeated(dir)) return;
		insertStation(rows);
		renderRouteTable();
		onRouteChanged();
		arrowFocus(routeCell(rows, col));
		return;
	}
	arrowEdge = { dir: "", time: 0 };
	arrowFocus(routeCell(next[0], next[1]));
});

// timetable: row -1 is the train number, which spans both columns of a train
function timetableCell(bound, t, s, field){
	const $table = $(`#timetable-${bound}`);
	if(s < 0) return $table.find(`.train-number[data-train="${t}"]`);
	return $table.find(`.time-input[data-train="${t}"][data-station="${s}"][data-field="${field}"]`);
}

$(".timetable").on("keydown", ".train-number, .time-input", function(e){
	const dir = ARROW_KEYS[e.key];
	if(!dir || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.originalEvent.isComposing) return;
	if((dir == "left" || dir == "right") && !arrowCaretAtEdge(this, dir)) return;

	const bound = tableBound(this);
	const t = $(this).data("train");
	const isNumber = $(this).hasClass("train-number");
	const s = isNumber ? -1 : $(this).data("station");
	const field = isNumber ? "" : $(this).data("field");
	const trainCount = TRAINS[bound].length;
	const stationCount = boundStations(bound).length;

	let target = null;	// [t, s, field]
	if(dir == "up"){
		if(!isNumber) target = [t, s - 1, field];
	}else if(dir == "down"){
		if(isNumber) target = [t, 0, "departure"];
		else if(s + 1 < stationCount) target = [t, s + 1, field];
	}else if(dir == "left"){
		if(isNumber){ if(t > 0) target = [t - 1, -1, ""]; }
		else if(field == "departure") target = [t, s, "arrival"];
		else if(t > 0) target = [t - 1, s, "departure"];
	}else{
		if(isNumber || field == "departure"){
			if(t + 1 < trainCount) target = [t + 1, s, isNumber ? "" : "arrival"];
			else target = "add";
		}else target = [t, s, "departure"];
	}

	e.preventDefault();
	if(target === "add"){
		if(!arrowEdgeRepeated(dir)) return;
		TRAINS[bound].push(newTrain());
		renderTimetable(bound);
		arrowFocus(timetableCell(bound, trainCount, s, isNumber ? "" : "arrival"));
		return;
	}
	arrowEdge = { dir: "", time: 0 };
	if(target) arrowFocus(timetableCell(bound, ...target));
});
