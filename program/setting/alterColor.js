$("body").on("change", ".train-color-input", function(){
	const index = $(this).data("color");
	const newcolor = $(this).val();
	SETTINGS.trainColors[index] = newcolor;
	document.documentElement.style.setProperty(`--color${index}`, newcolor);
});
