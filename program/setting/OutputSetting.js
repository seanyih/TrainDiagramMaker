function hhmmToSec(value){
	return 3600*Math.floor(value/100) + 60*(value%100);
}

function secToHhmm(sec){
	return String(100*Math.floor(sec/3600) + Math.floor(sec%3600/60)).padStart(4, "0");
}

// the diagram may extend to 30:00 (06:00 the next day)
const MAX_END_SEC = 108000;

function setTimeRange(key, input){
	const raw = $(input).val();
	const sec = hhmmToSec(raw);
	const other = (key == "startSec") ? SETTINGS.endSec : SETTINGS.startSec;
	const valid = /^\d{3,4}$/.test(raw) && raw%100 < 60 && sec <= MAX_END_SEC
		&& ((key == "startSec") ? sec < other : other < sec);
	if(valid) SETTINGS[key] = sec;
	else      $(input).val(secToHhmm(SETTINGS[key]));
}

$("body").on("change","#starthhmm",function(){
	setTimeRange("startSec", this);
});

$("body").on("change","#endhhmm",function(){
	setTimeRange("endSec", this);
});

// "a.b.c" -> [SETTINGS.a.b, "c"]
function settingRef(path){
	const keys = path.split(".");
	const last = keys.pop();
	return [keys.reduce((obj, key) => obj[key], SETTINGS), last];
}

function initSettingsUI(){
	$("[data-setting]").each(function(){
		const [obj, key] = settingRef($(this).data("setting"));
		if(this.type == "checkbox") this.checked = obj[key];
		else                        $(this).val(obj[key]);
	});
	$("#starthhmm").val(secToHhmm(SETTINGS.startSec));
	$("#endhhmm").val(secToHhmm(SETTINGS.endSec));
	$(".train-color-input").each(function(){
		const index = $(this).data("color");
		$(this).val(SETTINGS.trainColors[index]);
		document.documentElement.style.setProperty(`--color${index}`, SETTINGS.trainColors[index]);
	});
	updateSettingsUI();
}

$("body").on("change", "[data-setting]", function(){
	const [obj, key] = settingRef($(this).data("setting"));
	const raw = $(this).val();

	if(this.type == "checkbox"){
		obj[key] = this.checked;
	}else if(raw == "" && $(this).is("[data-nullable]")){
		obj[key] = null;
	}else if(this.inputMode == "decimal" || $(this).is("select") && !isNaN(raw)){
		if(raw == "" || isNaN(raw) || (this.min !== "" && Number(raw) < Number(this.min)) || (this.max !== "" && Number(raw) > Number(this.max))){
			$(this).val(obj[key]);
			return;
		}
		obj[key] = Number(raw);
	}else{
		obj[key] = raw;
	}

	updateSettingsUI();
	checkTextFit();
});

function updateSettingsUI(){
	const tl = SETTINGS.timeLabel;
	$(".time-format-fields").each(function(){
		$(this).toggle($(this).data("format") == tl.format);
	});
	$("#secondary-label-select").prop("disabled", SETTINGS.lines.secondary.interval < 10);
	$('[data-setting="background.color"]').prop("disabled", SETTINGS.background.transparent);
	$("#train-number-fields").toggle(SETTINGS.showTrainNumber);

	const avoid = SETTINGS.trainNumberAvoidance;
	$("#avoid-fields").toggle(avoid.enabled);
	$("#avoid-secondary").prop("disabled", !canAvoidSecondaryLines());
	$("#avoid-secondary-hint").html(canAvoidSecondaryLines() ? "" : `次要時間線間隔 × 每分鐘像素需 ≥ ${MIN_PX_TO_AVOID_SECONDARY_LINES}px 才可使用`);
	const pt = SETTINGS.passingTime;
	$("#pt-max-increase-row").toggle(pt.solver == "greedy");
	$("#pt-imprecise-fields").toggle(pt.imprecise);
	$("#pt-inaccurate-arrival").prop("disabled", pt.imprecise);
	$("#pt-imprecise").prop("disabled", pt.inaccurateArrival);
	$('[data-setting="passingTime.timetableGranularity"], [data-setting="passingTime.minDwell"]').attr("min", pt.timeGranularity);
	renderTimeLabelPreview();
}

// time axis from 8:00 to 9:00, drawn with the same functions as the diagram
function renderTimeLabelPreview(){
	const o = $("#time-label-preview");
	o.children().remove();

	const pxPerMin = 6;
	const left = 40;
	const top = 10;
	const plotHeight = 30;
	const labelY = top + plotHeight + SETTINGS.timeLabel.gap + timeLabelHeight();
	o.attr("width", 60*pxPerMin + 2*left);
	o.attr("height", labelY + 10);

	const start = 8*3600;
	const step = SETTINGS.lines.secondary.interval*60;
	for(let t = start; t <= start + 3600; t += step){
		const x = (t - start)/60*pxPerMin + left;
		const primary = (t % 3600 == 0);
		const line = primary ? SETTINGS.lines.primary : SETTINGS.lines.secondary;
		o.append(makeSVG("line", {x1:x, x2:x, y1:top, y2:top+plotHeight, stroke: line.color, 'stroke-width': line.width}));

		const label = makeTimeLabel(t, primary, x, labelY);
		if(label) o.append(label);
	}
}

// longest name * font size (+ gap) must fit in the side margins, and the time text height in the bottom margin
function checkTextFit(){
	const { margin, aliasText, timeLabel } = SETTINGS;
	// field: "name" | "alias"; secondary stations have their own text settings
	const widest = field => Math.max(...ROUTE.stations.map((station, i) => {
		const text = stationTextStyles(i)[field];
		return station[field].length*text.fontSize + text.gap;
	}));
	const reasons = [];

	if(widest("name") > margin.left){
		reasons.push("站名超出左側邊界");
	}
	if(aliasText.show && widest("alias") > margin.right){
		reasons.push("別名超出右側邊界");
	}
	if(timeLabelHeight() + timeLabel.gap > margin.bottom){
		reasons.push("時間文字超出下方邊界");
	}

	if(reasons.length > 0){
		$("#TextOverflowReason").html(reasons.join("、"));
		$("#TextOverflowWarning").toast('show');
	}
}
