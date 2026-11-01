/*
	Route & diagram database: database/ of this site, served as is (see database/README.md).
	catalog.json -> <country>/catalog.json -> <country>/<line>/info.json
*/
const DB_BASE = "/database";
const DB_LINE_ID = /^[a-z0-9-]+\/[a-z0-9-]+$/;
const DB_FILE = /^[a-z0-9-]+\/[a-z0-9-]+\/releases\/[\w.-]+$/;
// the search page's query string, for Back on the line page
const DB_SEARCH_KEY = "rtd-db-search";

const dbCache = {};

function dbFetchJSON(path){
	dbCache[path] ??= fetch(`${DB_BASE}/${path}`).then(res => res.ok ? res.json() : Promise.reject(res.status));
	return dbCache[path];
}

// names = { zh: "...", en: "..." }
function dbName(names){
	return names[currentLang.dir] ?? names.zh ?? Object.values(names)[0];
}

// the one marked latest (else the newest) first, then the newest to oldest
function dbSortReleases(releases){
	const sorted = [...releases].sort((a, b) => b.date.localeCompare(a.date));
	const latest = sorted.find(r => r.latest) ?? sorted[0];
	return sorted.length ? [latest, ...sorted.filter(r => r != latest)] : [];
}

function dbDownload(path, fileName){
	return fetch(`${DB_BASE}/${path}`).then(res => res.ok ? res.blob() : Promise.reject(res.status)).then(blob => downloadFile(fileName, blob));
}
