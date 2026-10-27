let editingTrain = null;
let editingOptionBar = null;

$(".timetable").on("click", ".optionbar", function(){
	editingTrain = TRAINS[tableBound(this)][$(this).data("train")];
	editingOptionBar = $(this);

	$("#offcanvas-train-id").html(escapeHTML(editingTrain.train_number));
	$("#offcanvas-train-name").val(editingTrain.settings.train_name);
	$("#offcanvas-train-color").val(editingTrain.settings.train_color);
	styleColorSelect(editingTrain.settings.train_color);
	$("#timetable-offcanvas").offcanvas("show");
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
