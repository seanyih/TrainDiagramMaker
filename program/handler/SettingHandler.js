// export settings: json only
$("body").on("click", ".export-setting-btn", function(){
	const fileName = $("#ExportSettingFilename").val() || "Settings";
	downloadFile(`${fileName}.json`, JSON.stringify(SETTINGS, null, 4));
});

$("body").on("click", "#ImportSettingBtn", function(){
	const selected = readImportFile("#SettingFile", text => {
		try{
			applySettings(loadSettingsFromJSON(text));
		}catch(e){
			$("#ImportSettingFailed").toast('show');
			return;
		}
		$("#ImportSettingSuccess").toast('show');
		checkTextFit();
	});
	if(!selected) $("#ImportSettingFailed").toast('show');
});

// missing or mistyped fields use the defaults (for files from older versions), unknown fields are dropped;
// lists empty by default (stopRules) are taken as they are
function loadSettingsFromJSON(text){
	return mergeSettings(DEFAULT_SETTINGS, JSON.parse(text));
}

function mergeSettings(def, data){
	if(Array.isArray(def)){
		if(def.length == 0) return Array.isArray(data) ? data : [];
		return def.map((value, i) => mergeSettings(value, Array.isArray(data) ? data[i] : undefined));
	}
	if(def === null) return (typeof data == "number") ? data : null; // a number that may be unset
	if(typeof def == "object"){
		const obj = (data !== null && typeof data == "object" && !Array.isArray(data)) ? data : {};
		return Object.fromEntries(Object.keys(def).map(key => [key, mergeSettings(def[key], obj[key])]));
	}
	return (typeof data == typeof def) ? data : def;
}

function applySettings(settings){
	Object.assign(SETTINGS, settings);
	initSettingsUI();
	renderStopRules();
}
