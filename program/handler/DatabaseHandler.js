// diagram-maker.html?db=<country>/<line>/releases/<file>.json (開始製作 on the database page): imports that route or all-data file
function importFromDatabase(){
	const params = new URLSearchParams(location.search);
	const path = params.get("db");
	if(path === null) return;
	params.delete("db");
	history.replaceState(null, "", location.pathname + (params.size ? `?${params}` : "") + location.hash);

	if(!DB_FILE.test(path) || !path.endsWith(".json")){
		$("#ImportRouteFailed").toast('show');
		return;
	}
	fetch(`${DB_BASE}/${path}`).then(res => res.ok ? res.text() : Promise.reject(res.status)).then(text => {
		if("route" in JSON.parse(text)){
			loadAllFromJSON(text);
			$("#ImportAllSuccess").toast('show');
		}else{
			applyRoute(loadRouteFromJSON(text));
			$("#ImportRouteSuccess").toast('show');
		}
		generateTimetable();
	}).catch(() => $("#ImportRouteFailed").toast('show'));
}
