/*
	Database line page (zh/database/line.html?id=<country>/<line>): the line's releases from its info.json,
	each section with the latest (set by hand) on top and the older ones below.
*/
const DB_KINDS = { route: "路線", timetable: "時刻", all: "全部" };
const DB_TAGS = { mileage: "里程", track: "軌道配置", topology: "線路拓樸", complete: "完整", arrival: "到站時刻", solved: "計算完成" };
const DB_SECTIONS = [
	{ key: "route", title: "路線資料", formats: ["json"] },
	{ key: "all", title: "全部資料", formats: ["json", "svg", "pdf"] }
];
const DB_FORMATS = { json: "JSON", svg: "SVG", pdf: "PDF" };
const DB_DOWNLOAD_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11"/></svg>`;

function releaseRow(base, line, release, formats){
	const tags = [`<span class="db-tag db-kind">${DB_KINDS[release.kind]}</span>`, ...release.tags.map(tag => `<span class="db-tag">${DB_TAGS[tag]}</span>`)];
	const files = formats.map(format => {
		const file = release.files[format];
		if(!file) return `<span class="db-file-none"></span>`;
		const name = `${line.name}_${file.split("/").pop()}`;
		return `<button type="button" class="db-file" data-path="${escapeHTML(`${base}/${file}`)}" data-name="${escapeHTML(name)}" aria-label="下載 ${DB_FORMATS[format]}">${DB_DOWNLOAD_ICON}${DB_FORMATS[format]}</button>`;
	});
	return `
		<li class="db-release">
			<span class="db-release-date">${escapeHTML(release.date)}</span>
			<span>|</span>
			<span class="db-release-title">${escapeHTML(release.title)}</span>
			<span class="db-tags">${tags.join("")}</span>
			<span class="db-files">${files.join("")}</span>
		</li>`;
}

function releaseSection(base, line, section){
	const releases = line[section.key];
	if(releases.length == 0) return "";
	const rows = releases.map(release => releaseRow(base, line, release, section.formats));
	const older = rows.length > 1 ? `<ul class="db-releases db-older">${rows.slice(1).join("")}</ul>` : "";
	return `
		<details class="db-section" open>
			<summary>${section.title}</summary>
			<ul class="db-releases">${rows[0]}</ul>
			${older}
		</details>`;
}

function sourcesSection(line){
	if(!line.sources?.length) return "";
	const items = line.sources.map(source => source.url
		? `<li><a href="${escapeHTML(source.url)}" target="_blank" rel="noopener">${escapeHTML(source.title)}</a></li>`
		: `<li>${escapeHTML(source.title)}</li>`);
	return `
		<details class="db-section">
			<summary>時刻表來源</summary>
			<ul class="db-sources">${items.join("")}</ul>
		</details>`;
}

function renderLine(id, country, line){
	const companies = line.companies.map(c => dbName(country.companies.find(company => company.id == c).name)).join("・");
	const start = line.route.length ? `<a class="db-start" href="../diagram-maker.html?db=${id}/${line.route[0].files.json}" target="_blank">開始製作</a>` : "";
	document.title = `${line.name} - 資料庫 - Train Diagram Maker`;
	$("#DbLine").html(`
		<header class="db-head">
			<h1><span class="db-flag">${country.flag}</span>${escapeHTML(line.name)}<span class="db-head-sub">${escapeHTML(companies)} | ${escapeHTML(line.section)}</span></h1>
			${start}
		</header>
		${DB_SECTIONS.map(section => releaseSection(id, line, section)).join("")}
		${sourcesSection(line)}`);
}

function showDbMessage(text){
	$("#DbMessage").text(text).removeClass("db-hidden");
}

$("body").on("click", ".db-file", function(){
	const $button = $(this).prop("disabled", true);
	dbDownload($button.data("path"), $button.data("name")).catch(() => showDbMessage("下載失敗，請稍後再試")).finally(() => $button.prop("disabled", false));
});

$(function(){
	const id = new URLSearchParams(location.search).get("id") ?? "";
	if(!DB_LINE_ID.test(id)){
		showDbMessage("找不到這條路線");
		return;
	}
	const countryId = id.split("/")[0];
	const search = sessionStorage.getItem(DB_SEARCH_KEY);
	$("#DbBack").attr("href", search && new URLSearchParams(search).get("c") == countryId ? `./${search}` : `./?c=${countryId}`);

	Promise.all([dbFetchJSON("catalog.json"), dbFetchJSON(`${id}/info.json`)]).then(([catalog, line]) => {
		renderLine(id, catalog.countries.find(c => c.id == countryId), line);
	}).catch(() => showDbMessage("找不到這條路線"));
});
