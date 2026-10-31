/*
	Route & diagram database: a separate repo (TrainDiagramMaker_data) published as static files.
	On localhost it is read from its tools/serve.py. catalog.json -> <country>/catalog.json -> <country>/<line>/info.json
*/
const DB_BASE = ["localhost", "127.0.0.1"].includes(location.hostname) ? "http://localhost:8766" : "https://traindiagrammaker-data.pages.dev";
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

function dbDownload(path, fileName){
	return fetch(`${DB_BASE}/${path}`).then(res => res.ok ? res.blob() : Promise.reject(res.status)).then(blob => downloadFile(fileName, blob));
}
