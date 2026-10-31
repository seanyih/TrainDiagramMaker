$("body").on("change", "#print-mm-per-km, #print-mm-per-min", function(){
	const raw = $(this).val();
	if(raw == "" || isNaN(raw) || Number(raw) <= 0){
		renderPrintUI();
		return;
	}
	const key = (this.id == "print-mm-per-km") ? "pxPerKm" : "pxPerMin";
	SETTINGS[key] = mmToPx(Number(raw));
	$(`[data-setting="${key}"]`).val(+SETTINGS[key].toFixed(3));
	updateSettingsUI();
});

// mm, portrait; B sizes are JIS
const PRINT_PAGE_SIZES = { A4: [210, 297], A5: [148, 210], B5: [182, 257], B6: [128, 182] };
const PRINT_PAGE_PRESETS = Object.entries(PRINT_PAGE_SIZES).flatMap(([name, [w, h]]) => [
	{ value: `${name}-p`, label: `${name} 直`, width: w, height: h },
	{ value: `${name}-l`, label: `${name} 橫`, width: h, height: w }
]);
$("#print-page-preset").append(PRINT_PAGE_PRESETS.map(p => `<option value="${p.value}">${p.label}</option>`).join(""));

$("body").on("change", "#print-page-preset", function(){
	const preset = PRINT_PAGE_PRESETS.find(p => p.value == this.value);
	if(!preset) return;
	SETTINGS.print.page = { width: preset.width, height: preset.height };
	initSettingsUI();
});

$("body").on("show.bs.collapse", "#printSettingWindow", renderPrintUI);

$("body").on("click", "#DownloadPrintBtn", async function(){
	let reason;
	try{
		reason = await exportPrintZip();
	}catch(e){
		reason = e.message;
	}
	if(reason){
		$("#PrintExportFailedReason").text(reason);
		$("#PrintExportFailed").toast('show');
	}
});

function renderPrintUI(){
	const p = SETTINGS.print;
	$("#print-fields").toggle(p.enabled);
	$("#DownloadPrintBtn").toggle(p.enabled);
	if(!p.enabled) return;

	const { width, height } = p.page;
	$("#print-page-preset").val((PRINT_PAGE_PRESETS.find(preset => preset.width == width && preset.height == height) || { value: "" }).value);
	$("#print-mm-per-km").val(+pxToMm(SETTINGS.pxPerKm).toFixed(3));
	$("#print-mm-per-min").val(+pxToMm(SETTINGS.pxPerMin).toFixed(3));

	const layout = printLayout();
	const mm = value => +value.toFixed(2);
	const sides = { top: "上", bottom: "下", left: "左", right: "右" };
	$("#print-padding-body").html(Object.entries(sides).map(([side, name]) => {
		const red = layout.over[side] ? ' class="text-danger fw-bold"' : "";
		return `<tr><td>${name}</td><td${red}>${mm(layout.pad[side])}</td><td${red}>${mm(layout.padText[side])}</td></tr>`;
	}).join(""));
	$("#print-summary").text(`${layout.pages} 頁，每頁圖框 ${mm(layout.frame.w)} × ${mm(layout.frame.h)} mm`);
	const over = Object.values(layout.over).some(value => value);
	$("#print-over-warning").toggle(over);
	renderPrintPreview(layout, over);
}

// the page, its bleed, the plot frame and the text around it
function renderPrintPreview(layout, over){
	const { page, bleed } = SETTINGS.print;
	const sheet = { width: page.width + bleed.left + bleed.right, height: page.height + bleed.top + bleed.bottom };
	const scale = Math.min(200/sheet.width, 260/sheet.height);
	const { pad, ext, frame } = layout;

	const o = $("#print-preview");
	o.children().remove();
	o.attr("width", sheet.width*scale);
	o.attr("height", sheet.height*scale);
	const rect = (x, y, w, h, attrs) => o.append(makeSVG("rect", { x: x*scale, y: y*scale, width: w*scale, height: h*scale, ...attrs }));
	rect(0, 0, sheet.width, sheet.height, { fill: "#DDDDDD", stroke: over ? "#DC3545" : "none", "stroke-width": 2 });
	rect(bleed.left, bleed.top, page.width, page.height, { fill: "#FFFFFF", stroke: "none" });
	const x = bleed.left + pad.left;
	const y = bleed.top + pad.top;
	rect(x - ext.left, y - ext.top, frame.w + ext.left + ext.right, frame.h + ext.top + ext.bottom, { fill: "none", stroke: "#F28800", "stroke-dasharray": "3 2" });
	rect(x, y, frame.w, frame.h, { fill: "none", stroke: "#2C8CCC", "stroke-width": 1.5 });
}
