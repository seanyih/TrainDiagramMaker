// 疊圖 (Overlay.js): station selects, export of a section, import onto this route

// the section's two ends: every route station; keeps the selection when the names are still there
function renderOverlayStations(){
	["#OverlayFrom", "#OverlayTo"].forEach((id, end) => {
		const old = $(id).val();
		const options = ROUTE.stations.map((s, r) => `<option value="${r}">${escapeHTML(s.name || `(第 ${r + 1} 站)`)}</option>`);
		$(id).html(options.join(""));
		const fallback = end == 0 ? 0 : ROUTE.stations.length - 1;
		$(id).val(old !== null && old < ROUTE.stations.length ? old : fallback);
	});
}

$("#ExportOverlayBtn").on("click", function(){
	let from = parseInt($("#OverlayFrom").val());
	let to = parseInt($("#OverlayTo").val());
	if(from > to) [from, to] = [to, from];
	if(from == to){
		$("#OverlayResult").html(`<span class="text-danger">起訖站不能相同</span>`);
		return;
	}
	const data = getOverlayJSON(from, to);
	const name = $("#ExportOverlayFilename").val()
		|| `Overlay_${ROUTE.stations[from].name}-${ROUTE.stations[to].name}`;
	downloadFile(`${name}.json`, JSON.stringify(data, null, 4));
	$("#OverlayResult").text(`已匯出 ${ROUTE.stations[from].name}–${ROUTE.stations[to].name} 共 ${data.train_count} 班車`);
});

$("#ImportOverlayBtn").on("click", function(){
	const selected = readImportFile($("#OverlayFile"), text => {
		try{
			const r = applyOverlay(JSON.parse(text), $("#OverlayConflict").val());
			refreshTimetable(1);
			refreshTimetable(2);
			const unmatched = r.stations.length ? `；本路線沒有的車站 (略過)：${r.stations.map(escapeHTML).join("、")}` : "";
			$("#OverlayResult").html(`已疊加：合併 ${r.merged} 班、新增 ${r.added} 班、略過 ${r.skipped} 班${unmatched}`);
			$("#ImportOverlaySuccess").toast("show");
		}catch(e){
			$("#OverlayResult").html(`<span class="text-danger">疊圖失敗：${escapeHTML(e.message)}</span>`);
		}
	});
	if(!selected) $("#ImportTimeFailed").toast("show");
});

$("#offcanvas-unpin").on("click", function(){
	unpinTrain(editingTrain);
	renderPinnedCount();
	refreshTimetable(editingBound);
});

// how many pinned stops the train being edited has
function renderPinnedCount(){
	const count = editingTrain.timetable.filter(stop => stop.pinned).length;
	$("#offcanvas-pinned-count").text(count);
	$("#offcanvas-pinned").toggle(count > 0);
}
