function resetNav(){
	$("#nav-route").removeClass("selected");
	$("#nav-timetable-1").removeClass("selected");
	$("#nav-timetable-2").removeClass("selected");
	$("#nav-setting").removeClass("selected");
	$("#nav-output").removeClass("selected");
	$("#nav-inex").removeClass("selected");

	$("#nav-route").addClass("deselected");
	$("#nav-timetable-1").addClass("deselected");
	$("#nav-timetable-2").addClass("deselected");
	$("#nav-setting").addClass("deselected");
	$("#nav-output").addClass("deselected");
	$("#nav-inex").addClass("deselected");

	$("#container-route").css("display","none");
	$("#container-timetable-1").css("display","none");
	$("#container-timetable-2").css("display","none");
	$("#container-setting").css("display","none");
	$("#container-output").css("display","none");
	$("#container-inex").css("display","none");
}


$("#nav-route").on("click",function(){
	resetNav();
	$("#nav-route").addClass("selected");
	$("#nav-route").removeClass("deselected");
	$("#container-route").css("display","");
	
	
});

$("#nav-timetable-1").on("click",function(){
	resetNav();
	$("#nav-timetable-1").addClass("selected");
	$("#nav-timetable-1").removeClass("deselected");
	if(timetableDirty[1]) renderTimetable(1);
	$("#container-timetable-1").css("display","");
});

$("#nav-timetable-2").on("click",function(){
	resetNav();
	$("#nav-timetable-2").addClass("selected");
	$("#nav-timetable-2").removeClass("deselected");
	if(timetableDirty[2]) renderTimetable(2);
	$("#container-timetable-2").css("display","");
});

$("#nav-setting").on("click",function(){
	resetNav();
	$("#nav-setting").addClass("selected");
	$("#nav-setting").removeClass("deselected");
	$("#container-setting").css("display","");
});

$("#nav-output").on("click",function(){
	resetNav();
	$("#nav-output").addClass("selected");
	$("#nav-output").removeClass("deselected");
	$("#container-output").css("display","");
});

$("#nav-inex").on("click",function(){
	resetNav();
	$("#nav-inex").addClass("selected");
	$("#nav-inex").removeClass("deselected");
	$("#container-inex").css("display","");
});