/*
	基本設定 > 待避時間計算: auto-fill (RunTimeAutofill.js), restoring passing times, with fine-tuning if checked
	(PassingTime.js or PassingTimeSTN.js, as chosen), and its stop rules (SETTINGS.passingTime.stopRules).
	Each changes a draft (Draft.js), which can be previewed on the output page and replaces the timetable when adopted.
*/

const DRAFT_TITLES = { autofill: "自動補全", passing: "還原通過時間" };

function updateDraftUI(){
	Object.keys(DRAFTS).forEach(name => {
		$(`.draft-bar[data-draft="${name}"], .preview-draft-btn[data-draft="${name}"]`).toggle(DRAFTS[name] !== null);
	});
	if(DRAFTS.autofill) $("#AutofillDraftCount").text(DRAFTS.autofill.changed.size);
}

// the draft, or null; an outdated draft is dropped with a toast
function checkedDraft(name){
	if(DRAFTS[name] && !validDraft(name)){
		$("#DraftInvalid").toast('show');
		updateDraftUI();
	}
	return DRAFTS[name];
}

// null = condition not checked
function autofillConditions(){
	const pattern = (check, input) => $(check).prop("checked") ? $(input).val().trim() : null;
	return {
		number: pattern("#AutofillByNumber", "#AutofillNumber"),
		color: $("#AutofillByColor").prop("checked") ? Number($("#AutofillColor").val()) : null,
		name: pattern("#AutofillByName", "#AutofillName")
	};
}

// { results, all }, or { message } if the form is not complete
function autofillTargets(trains){
	const number = $("#AutofillGolden").val().trim();
	const conditions = autofillConditions();
	if(number == "") return { message: "請輸入車次" };
	const golden = findTrainByNumber(trains, number);
	if(!golden) return { message: `找不到車次 ${escapeHTML(number)}` };
	if(Object.values(conditions).every(value => value === null)) return { message: "請至少勾選一個條件" };

	const results = computeAutofill(trains, golden.bound, golden.train, conditions);
	return { results: results, all: results.length == trains[golden.bound].length - 1 };
}

function renderAutofillTargets(){
	const { message, results, all } = autofillTargets(DRAFTS.autofill ? DRAFTS.autofill.trains : TRAINS);
	let text = message;
	if(results) text = (results.length == 0) ? "無" : all ? "所有" : results.map(({ train }) => escapeHTML(train.train_number || "(無車次)")).join("、");
	$("#AutofillTargets").html(text);
	$("#AutofillBtn").prop("disabled", !results || results.length == 0);
}

$("body").on("input change", ".autofill-input", function(){
	$("#AutofillTargetsBox").show();
	renderAutofillTargets();
});

$("body").on("change", "#AutofillColor, #StopRuleColor", function(){
	styleColorSelect(Number($(this).val()), $(this));
});

// applied to the draft; a later run builds on it
$("body").on("click", "#AutofillBtn", function(){
	const draft = checkedDraft("autofill") ?? { ...newDraft(), changed: new Set() };
	const { results } = autofillTargets(draft.trains);
	if(!results || results.length == 0){
		$("#AutofillFailed").toast('show');
		return;
	}
	applyAutofill(results);
	results.forEach(({ train }) => draft.changed.add(train));
	DRAFTS.autofill = draft;
	$("#AutofillCount").text(results.length);
	$("#AutofillSuccess").toast('show');
	updateDraftUI();
	renderAutofillTargets();
});

const ROUNDING_NAMES = { round: "四捨五入", floor: "無條件捨去", ceil: "無條件進位" };

// restoring on a new draft `name` with the chosen solver, showing the outcome in `result`;
// an imprecise timetable rounded in an unknown way is restored once for each way, keeping the one with the fewest
// conflicts, then the most even running times
function runPassingTime(name, button, headway, result){
	button.prop("disabled", true);
	DRAFTS[name] = null;
	updateDraftUI();
	const { solver, imprecise, roundingMode } = SETTINGS.passingTime;
	const roundings = !imprecise ? [null] : (roundingMode == "auto") ? Object.keys(ROUNDING_NAMES) : [roundingMode];
	const runs = [];
	const counted = counts => `追越 ${counts.overtake} | 交會 ${counts.cross}${headway ? ` | 時隔不足 ${counts.headway}` : ""}`;
	result.hide();

	const onRound = () => {};
	const finish = ({ draft, counts, written, rounding }) => {
		if(written.added + written.moved + written.stops + written.arrivals + written.times > 0) DRAFTS[name] = draft;
		result.text(`最終衝突數：${counted(counts)}。新增 ${written.added} 個通過時刻${headway ? `，調整 ${written.moved} 個` : ""}${written.stops ? `，臨時停車 ${written.stops} 次` : ""}${written.arrivals ? `，修改 ${written.arrivals} 個到站時刻` : ""}${written.times ? `，調整 ${written.times} 個停靠站時刻` : ""}。${(roundings.length > 1) ? `精度的處理方式：${ROUNDING_NAMES[rounding]}。` : ""}`).show();
		button.prop("disabled", false);
		updateDraftUI();
	};
	const start = () => {
		const draft = newDraft();
		const rounding = roundings[runs.length];
		const onDone = (counts, written, m) => {
			const score = (counts.overtake + counts.cross)*CONFLICT + counts.headway*HEADWAY;
			runs.push({ draft: draft, counts: counts, written: written, rounding: rounding, score: score, spread: runTimeSpread(m) });
			if(runs.length < roundings.length){
				start();
				return;
			}
			finish(runs.reduce((best, run) => (run.score < best.score || (run.score == best.score && run.spread < best.spread - 1e-6)) ? run : best));
		};
		if(solver == "greedy") restorePassingTimes(draft.trains, true, headway, onRound, onDone, rounding);
		else restorePassingTimesSTN(draft.trains, headway, onRound, onDone, rounding);
	};
	start();
}

$("body").on("click", "#PassingTimeBtn", function(){
	runPassingTime("passing", $(this), SETTINGS.passingTime.fineTune, $("#PassingTimeResult"));
});

// the detail and stop rule panels are mutually exclusive
$("body").on("click", "#PassingTimeDetailBtn", function(){
	$("#PassingTimeStopRules").hide();
	$("#PassingTimeDetail").toggle();
});

const STOP_RULE_STATIONS = { all: "所有車站", cross: "所有可交會的站", overtake: "所有可追越的站" };

// e.g. "車次為 7*、列車名為 普通 的逆行列車都可以在中道信号場臨時停車"
function stopRuleTitle(rule){
	const conditions = [];
	if(rule.number !== null) conditions.push(`車次為 ${escapeHTML(rule.number)}`);
	if(rule.color !== null) conditions.push(`線條顏色為 ${(rule.color == 0) ? "未設定顏色"
		: `<span style="display: inline-block; width: 1em; height: 1em; vertical-align: middle; background-color: var(--color${rule.color});"></span> 顏色${rule.color}`}`);
	if(rule.name !== null) conditions.push(`列車名為 ${escapeHTML(rule.name)}`);
	const station = (rule.stations == "station") ? escapeHTML(rule.station) : STOP_RULE_STATIONS[rule.stations];
	return `${conditions.length ? `${conditions.join("、")} 的` : "所有"}${["", "順行", "逆行"][rule.bound]}列車都可以在${station}臨時停車`;
}

// the train numbers of a rule, or 所有 / 無
function stopRuleTrains(rule){
	const trains = ((rule.bound == 0) ? [1, 2] : [rule.bound]).flatMap(bound => TRAINS[bound].filter(train => !isBlankTrain(train)).map(train => [bound, train]));
	const matched = trains.filter(([bound, train]) => stopRuleTrain(rule, bound, train));
	if(matched.length == 0) return "無";
	if(matched.length == trains.length) return "所有";
	return matched.map(([bound, train]) => escapeHTML(train.train_number || "(無車次)")).join("、");
}

// the stations of a rule, or 所有 / 無
function stopRuleStations(rule){
	if(rule.stations == "all") return "所有";
	const names = ROUTE.stations.filter((station, r) => stopRuleStation(rule, rule.bound || 3, r)).map(station => escapeHTML(station.name));
	return (names.length == 0) ? "無" : names.join("、");
}

// the station choices (keeping the chosen one) and the rules
function renderStopRules(){
	const select = $("#StopRuleStation");
	const chosen = select.val();
	select.html(Object.entries(STOP_RULE_STATIONS).map(([value, text]) => `<option value="${value}">${text}</option>`)
		.concat(ROUTE.stations.map((station, r) => `<option value="${r}">${escapeHTML(station.name)}</option>`)).join(""));
	if(select.find(`option[value="${chosen}"]`).length > 0) select.val(chosen);

	const rules = SETTINGS.passingTime.stopRules;
	$("#StopRuleList").html((rules.length == 0) ? `<p class="text-muted d-flex align-items-center justify-content-center h-100 mb-0">尚未新增規則</p>` : rules.map((rule, i) => `
		<div class="d-flex align-items-start border-bottom py-2">
			<div class="flex-grow-1">
				<div class="fw-bold fs-5">${stopRuleTitle(rule)}</div>
				<small class="text-muted d-block text-break">車次：${stopRuleTrains(rule)}</small>
				<small class="text-muted d-block text-break">車站：${stopRuleStations(rule)}</small>
			</div>
			<button type="button" class="btn-close delete-stop-rule" data-index="${i}" aria-label="刪除"></button>
		</div>`).join(""));
}

$("body").on("click", "#PassingTimeStopRuleBtn", function(){
	renderStopRules();
	$("#PassingTimeDetail").hide();
	$("#PassingTimeStopRules").toggle();
});

// a checked pattern must not be blank
$("body").on("click", "#StopRuleAddBtn", function(){
	const pattern = (check, input) => {
		const used = $(check).prop("checked");
		const value = $(input).val().trim();
		$(input).css("background-color", (used && !value) ? "red" : "");
		return used ? value : null;
	};
	const number = pattern("#StopRuleByNumber", "#StopRuleNumber");
	const name = pattern("#StopRuleByName", "#StopRuleName");
	if(number === "" || name === "") return;
	const station = $("#StopRuleStation").val();
	const special = station in STOP_RULE_STATIONS;
	SETTINGS.passingTime.stopRules.push({
		bound: Number($("#StopRuleBound").val()),
		number: number,
		color: $("#StopRuleByColor").prop("checked") ? Number($("#StopRuleColor").val()) : null,
		name: name,
		stations: special ? station : "station",
		station: special ? null : ROUTE.stations[station].name
	});
	renderStopRules();
});

$("body").on("click", ".delete-stop-rule", function(){
	SETTINGS.passingTime.stopRules.splice($(this).data("index"), 1);
	renderStopRules();
});

$("body").on("click", ".adopt-draft-btn", function(){
	const name = $(this).data("draft");
	$("#AdoptDraftTitle").text(DRAFT_TITLES[name]);
	$("#AdoptDraftModal").data("draft", name).modal("show");
});

$("body").on("click", "#AdoptDraftConfirmBtn", function(){
	const name = $("#AdoptDraftModal").data("draft");
	$("#AdoptDraftModal").modal("hide");
	if(!checkedDraft(name)) return;
	adoptDraft(name);
	$("#DraftAdoptSuccess").toast('show');
	// the other drafts were made from the old timetable
	Object.keys(DRAFTS).forEach(other => checkedDraft(other));
	updateDraftUI();
	renderAutofillTargets();
});

$("body").on("click", ".discard-draft-btn", function(){
	DRAFTS[$(this).data("draft")] = null;
	updateDraftUI();
	renderAutofillTargets();
});

// the output shows the preview of a draft (its title) or the timetable (null); only its own download button is usable
function showPreviewState(title){
	$("#OutputSource").text(title ? `目前顯示：${title}的預覽 (尚未採用)` : "");
	$("#DownloadPreviewSVGBtn").toggle(title !== null);
	$("#DownloadSVGBtn").prop("disabled", title !== null);
}

$("body").on("click", ".preview-draft-btn", function(){
	const name = $(this).data("draft");
	const draft = checkedDraft(name);
	if(!draft) return;
	showPreviewState(DRAFT_TITLES[name]);
	window.setTimeout(() => drawDiagram(draft.trains), 50);
});

$("body").on("click", "#OutputBtn", function(){
	showPreviewState(null);
});

$("body").on("click", "#DownloadPreviewSVGBtn", function(){
	saveSvg(document.getElementById("output"), "TrainDiagram-preview.svg");
});
