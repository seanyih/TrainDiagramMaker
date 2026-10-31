/*
	Language menu: fills every .lang-switch. Each language has a folder (zh/, en/...) with the same file names,
	so switching only replaces the first folder of the path. Hovering a language prerenders it (prefetches where
	speculation rules are not supported). .lang-switch[data-carry] (the editor) carries the data over instead.
*/
const LANGS = [
	{ dir: "zh", hreflang: "zh-Hant", name: "繁體中文", ready: true },
	{ dir: "en", hreflang: "en", name: "English", ready: false },
	{ dir: "ja", hreflang: "ja", name: "日本語", ready: false }
];
const LANG_CARRY_KEY = "rtd-lang-carry";

const currentLang = LANGS.find(lang => location.pathname.split("/").includes(lang.dir)) ?? LANGS[0];

function langUrl(lang){
	return location.pathname.replace(`/${currentLang.dir}/`, `/${lang.dir}/`) + location.search;
}

function renderLangSwitch(){
	const items = LANGS.map(lang => {
		if(lang == currentLang) return `<li><a href="${langUrl(lang)}" hreflang="${lang.hreflang}" lang="${lang.hreflang}" aria-current="page">${lang.name}</a></li>`;
		if(!lang.ready) return `<li><span class="lang-switch-soon" lang="${lang.hreflang}">${lang.name}</span></li>`;
		return `<li><a href="${langUrl(lang)}" hreflang="${lang.hreflang}" lang="${lang.hreflang}">${lang.name}</a></li>`;
	});
	$(".lang-switch").html(`
		<button type="button" class="lang-switch-button" aria-haspopup="true" aria-expanded="false" aria-label="Language">
			<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><ellipse cx="8" cy="8" rx="2.8" ry="6.5"/><path d="M1.5 8h13"/></svg>
			<span>${currentLang.name}</span>
		</button>
		<ul class="lang-switch-menu">${items.join("")}</ul>`);
}

function prefetchLang(url){
	if($(`[data-lang-prefetch="${url}"]`).length) return;
	const prerender = HTMLScriptElement.supports?.("speculationrules") && !$(".lang-switch").is("[data-carry]");
	if(prerender) $("head").append($(`<script type="speculationrules" data-lang-prefetch="${url}">`).text(JSON.stringify({ prerender: [{ source: "list", urls: [url] }] })));
	else $("head").append(`<link rel="prefetch" href="${url}" data-lang-prefetch="${url}">`);
}

function setLangMenu(open){
	$(".lang-switch").toggleClass("open", open);
	$(".lang-switch-button").attr("aria-expanded", open);
}

// the editor calls this on DOM ready (generateTimetable() shows a toast)
function restoreLangCarry(){
	const text = sessionStorage.getItem(LANG_CARRY_KEY);
	if(text === null) return;
	sessionStorage.removeItem(LANG_CARRY_KEY);
	loadAllFromJSON(text);
	generateTimetable();
}

$("body").on("click", ".lang-switch-button", function(e){
	e.stopPropagation();
	setLangMenu(!$(this).closest(".lang-switch").hasClass("open"));
});

$("body").on("mouseenter focus", ".lang-switch-menu a:not([aria-current])", function(){
	prefetchLang($(this).attr("href"));
});

$("body").on("click", ".lang-switch-menu a:not([aria-current])", function(){
	if($(".lang-switch").is("[data-carry]") && ROUTE.stations.length) sessionStorage.setItem(LANG_CARRY_KEY, JSON.stringify(getAllDataJSON()));
});

$(document).on("click", () => setLangMenu(false));
$(document).on("keydown", e => { if(e.key == "Escape") setLangMenu(false); });

$(renderLangSwitch);
