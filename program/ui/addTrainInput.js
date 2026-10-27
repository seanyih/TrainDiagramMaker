function tableBound(element){
	return $(element).closest("table").data("bound");
}

$(".timetable").on("click", ".addtrain", function(){
	const bound = tableBound(this);
	TRAINS[bound].splice($(this).data("train") + 1, 0, newTrain());
	renderTimetable(bound);
});

$(".timetable").on("click", ".deletetrain", function(){
	const bound = tableBound(this);
	TRAINS[bound].splice($(this).data("train"), 1);
	renderTimetable(bound);
});

$(".timetable").on("change", ".train-number", function(){
	TRAINS[tableBound(this)][$(this).data("train")].train_number = $(this).val().trim();
});

$(".timetable").on("change", ".time-input", function(){
	const time = normalizeTime($(this).val());
	if(time === null){
		$(this).css("background-color", "red");
		return;
	}
	$(this).css("background-color", "").val(time);
	const bound = tableBound(this);
	const t = $(this).data("train");
	const s = $(this).data("station");
	setStopTime(bound, t, s, $(this).data("field"), time);
	$(this).closest("tr").find(`.time-input[data-train="${t}"]`).toggleClass("passing-time-input", isPassingStop(findStop(TRAINS[bound][t], s)));
});
