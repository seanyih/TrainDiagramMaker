/*
	Database search page (zh/database/index.html). Loads catalog.json, then the chosen country's catalog lazily.
	The text search matches the line's name and section and its companies, in every language.
	Filters live in the query string (?c=&r=&t=&co=&q=) and are kept in sessionStorage for the line page's Back.
*/
const DB_TYPES = { hsr: "高鐵", railway: "鐵路", narrow: "輕便鐵路", metro: "地鐵", "major-private": "大手私鐵", private: "私鐵", "third-sector": "第三部門鐵道", "new-transit": "新交通", lrt: "輕軌", other: "其他" };
const DB_PAGE_SIZE = 50;

let dbCountries = [];
let dbLines = [];
let dbMatches = [];
let dbShown = 0;
const dbFilter = { c: "", r: "", t: [], co: [], q: "" };

function dbCountry(){
	return dbCountries.find(c => c.id == dbFilter.c);
}

// 臺 = 台 when searching
function dbNormalize(text){
	return text.toLowerCase().replace(/臺/g, "台");
}

function readDbFilter(){
	const params = new URLSearchParams(location.search);
	dbFilter.c = params.get("c") ?? "";
	dbFilter.r = params.get("r") ?? "";
	dbFilter.t = (params.get("t") ?? "").split(",").filter(Boolean);
	dbFilter.co = (params.get("co") ?? "").split(",").filter(Boolean);
	dbFilter.q = params.get("q") ?? "";
	if(!dbCountry()) dbFilter.c = dbCountries[0].id;
}

function writeDbFilter(){
	const params = new URLSearchParams({ c: dbFilter.c });
	if(dbFilter.r) params.set("r", dbFilter.r);
	if(dbFilter.t.length) params.set("t", dbFilter.t.join(","));
	if(dbFilter.co.length) params.set("co", dbFilter.co.join(","));
	if(dbFilter.q) params.set("q", dbFilter.q);
	history.replaceState(null, "", `?${params}`);
	sessionStorage.setItem(DB_SEARCH_KEY, location.search);
}

function renderCountries(){
	$("#DbCountries").html(dbCountries.map(c => `
		<li><button type="button" class="db-option" data-country="${c.id}" aria-pressed="${c.id == dbFilter.c}"><span class="db-flag">${c.flag}</span>${escapeHTML(dbName(c.name))}</button></li>`).join(""));
}

// regions, types and companies that the country's lines have
function renderFilters(){
	const country = dbCountry();
	const regions = country.regions.map(r => ({ id: r.id, name: dbName(r.name) }));
	$("#DbRegionFilter").toggleClass("db-hidden", regions.length == 0);
	$("#DbRegions").html([{ id: "", name: "全部" }, ...regions].map(r => `
		<li><button type="button" class="db-option" data-region="${r.id}" aria-pressed="${r.id == dbFilter.r}">${escapeHTML(r.name)}</button></li>`).join(""));

	const check = (attr, id, name, checked) => `
		<label class="db-check"><input type="checkbox" data-${attr}="${id}"${checked ? " checked" : ""}>${escapeHTML(name)}</label>`;
	const types = Object.keys(DB_TYPES).filter(t => dbLines.some(line => line.types.includes(t)));
	$("#DbTypeFilter").toggleClass("db-hidden", types.length < 2);
	$("#DbTypes").html(types.map(t => check("type", t, DB_TYPES[t], dbFilter.t.includes(t))).join(""));
	const companies = country.companies.filter(c => dbLines.some(line => line.companies.includes(c.id)));
	$("#DbCompanyFilter").toggleClass("db-hidden", companies.length < 2);
	$("#DbCompanies").html(companies.map(c => check("company", c.id, dbName(c.name), dbFilter.co.includes(c.id))).join(""));
}

function lineRow(line){
	const country = dbCountry();
	const companies = line.companies.map(id => dbName(country.companies.find(c => c.id == id).name)).join("・");
	return `
		<li><a class="db-line" href="line.html?id=${country.id}/${line.id}">
			<span class="db-flag">${country.flag}</span>
			<span>${escapeHTML(dbName(line.name))}<span class="db-line-sub">${escapeHTML(companies)} | ${escapeHTML(dbName(line.section))}</span></span>
		</a></li>`;
}

function renderMoreLines(){
	$("#DbLines").append(dbMatches.slice(dbShown, dbShown + DB_PAGE_SIZE).map(lineRow).join(""));
	dbShown = Math.min(dbShown + DB_PAGE_SIZE, dbMatches.length);
}

function renderLines(){
	const query = dbNormalize(dbFilter.q.trim());
	dbMatches = dbLines.filter(line =>
		(!dbFilter.r || line.regions.includes(dbFilter.r)) &&
		(dbFilter.t.length == 0 || line.types.some(t => dbFilter.t.includes(t))) &&
		(dbFilter.co.length == 0 || line.companies.some(c => dbFilter.co.includes(c))) &&
		line.search.includes(query));
	dbShown = 0;
	$("#DbLines").empty();
	renderMoreLines();
	$("#DbMessage").text("沒有符合的路線").toggleClass("db-hidden", dbMatches.length > 0);
}

function loadCountry(){
	const country = dbCountry();
	return dbFetchJSON(`${country.id}/catalog.json`).then(data => {
		if(country != dbCountry()) return;
		const companyNames = id => Object.values(country.companies.find(c => c.id == id).name);
		dbLines = data.lines.map(line => ({
			...line,
			search: dbNormalize([...Object.values(line.name), ...Object.values(line.section), ...line.companies.flatMap(companyNames)].join("\n"))
		}));
		renderFilters();
		renderLines();
	});
}

function dbLoadFailed(){
	$("#DbLines").empty();
	$("#DbMessage").text("無法載入資料庫，請稍後再試").removeClass("db-hidden");
}

$("body").on("click", "[data-country]", function(){
	dbFilter.c = $(this).data("country");
	dbFilter.r = "";
	dbFilter.co = [];
	writeDbFilter();
	renderCountries();
	loadCountry().catch(dbLoadFailed);
});

$("body").on("click", "[data-region]", function(){
	dbFilter.r = $(this).data("region");
	$("[data-region]").attr("aria-pressed", function(){ return $(this).data("region") == dbFilter.r; });
	writeDbFilter();
	renderLines();
});

$("body").on("change", "[data-type], [data-company]", function(){
	dbFilter.t = $("[data-type]:checked").map(function(){ return $(this).data("type"); }).get();
	dbFilter.co = $("[data-company]:checked").map(function(){ return $(this).data("company"); }).get();
	writeDbFilter();
	renderLines();
});

$("body").on("input", "#DbQuery", function(){
	dbFilter.q = $(this).val();
	writeDbFilter();
	renderLines();
});

// the next rows when the end of the list comes into view (observed again to check if it still is)
const dbMoreObserver = new IntersectionObserver(entries => {
	if(!entries[0].isIntersecting || dbShown >= dbMatches.length) return;
	renderMoreLines();
	dbMoreObserver.unobserve(entries[0].target);
	dbMoreObserver.observe(entries[0].target);
}, { rootMargin: "400px" });

$(function(){
	dbMoreObserver.observe($("#DbMore")[0]);
	dbFetchJSON("catalog.json").then(data => {
		dbCountries = data.countries;
		readDbFilter();
		writeDbFilter();
		$("#DbQuery").val(dbFilter.q);
		renderCountries();
		return loadCountry();
	}).catch(dbLoadFailed);
});
