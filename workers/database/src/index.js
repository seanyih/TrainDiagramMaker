/*
	rtd-database: GET /<path> -> database/<path> of the private repo TrainDiagramMaker_data.
	The site reads it through DB_BASE (program/util/database.js).

	On workers.dev the Cache API does nothing (it needs a custom domain), and GitHub allows a token
	5,000 requests per hour, so files are kept in three places, checked in this order:
		1. this isolate's memory (lost when the isolate is recycled; per data center)
		2. KV, when DB_KV is bound (global, survives restarts)
		3. caches.default (only works once the Worker has a custom domain; harmless before)
	releases/* never change: once stored they are never asked again. Other files (catalog.json, info.json)
	are re-checked after FRESH ms with If-None-Match; GitHub's 304 does not count toward the rate limit,
	and KV is written only when the file really changed. When GitHub fails, the stored copy is served.
*/
const PATH = /^(?:[a-z0-9-]+\/){0,2}(?:releases\/)?[\w.-]+$/;
const RELEASE = /^[a-z0-9-]+\/[a-z0-9-]+\/releases\/[\w.-]+$/;
const TYPES = { json: "application/json; charset=utf-8", zip: "application/zip", svg: "image/svg+xml", pdf: "application/pdf" };
const FRESH = 5 * 60 * 1000;
const MEMORY_LIMIT = 48 * 1024 * 1024;	// isolates have 128 MB
const KV_LIMIT = 25 * 1024 * 1024;	// KV value limit

const memory = new Map();	// path -> { body: ArrayBuffer, etag, checked }, oldest first
const missing = new Map();	// path -> when GitHub said 404 (asked again after FRESH)
let memorySize = 0;

export default {
	async fetch(request, env, ctx){
		const cors = corsHeaders(request, env);
		if(request.method == "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "GET, HEAD", "Access-Control-Max-Age": "86400" } });
		if(request.method != "GET" && request.method != "HEAD") return text("Method Not Allowed", 405, cors);

		let path;
		try{
			path = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, "").replace(/^database\//, "");
		}catch{
			return text("Not Found", 404, cors);
		}
		const ext = path.split(".").pop().toLowerCase();
		if(!PATH.test(path) || path.split("/").some(p => p.startsWith(".")) || !(ext in TYPES)) return text("Not Found", 404, cors);

		let file;
		try{
			file = await getFile(path, env, ctx);
		}catch(e){
			console.log(`${path}: ${e.message}`);
			return text("Database unavailable", 502, { ...cors, "Cache-Control": "no-store" });
		}
		if(!file) return text("Not Found", 404, { ...cors, "Cache-Control": "public, max-age=60" });

		const headers = {
			...cors,
			"Content-Type": TYPES[ext],
			"Cache-Control": RELEASE.test(path) ? "public, max-age=31536000, immutable" : "public, max-age=300",
			"X-Content-Type-Options": "nosniff",
		};
		if(file.etag) headers.ETag = file.etag;
		if(file.etag && request.headers.get("If-None-Match") == file.etag) return new Response(null, { status: 304, headers });
		return new Response(request.method == "HEAD" ? null : file.body, { headers });
	},
};

// { body, etag } or null (no such file)
async function getFile(path, env, ctx){
	const immutable = RELEASE.test(path);
	if(Date.now() - (missing.get(path) ?? -Infinity) < FRESH) return null;
	let file = memory.get(path);
	if(file) touch(path, file);
	file ??= await fromKV(path, env);
	file ??= await fromCache(path);
	if(file && (immutable || Date.now() - file.checked < FRESH)){
		remember(path, file);
		return file;
	}

	let res;
	try{
		res = await fromGitHub(path, env, file?.etag);
	}catch(e){
		if(file) return file;	// GitHub down or rate limited: serve the stored copy
		throw e;
	}
	if(res.status == 404){
		if(missing.size > 1000) missing.clear();
		missing.set(path, Date.now());
		return null;
	}
	if(res.status == 304){
		file.checked = Date.now();
		remember(path, file);
		return file;
	}
	const fresh = { body: await res.arrayBuffer(), etag: res.headers.get("etag"), checked: Date.now() };
	remember(path, fresh);
	ctx.waitUntil(store(path, fresh, env));
	return fresh;
}

async function fromGitHub(path, env, etag){
	if(!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is not set");
	const repo = env.DATA_REPO || "seanyih/TrainDiagramMaker_data";
	const dir = (env.DATA_DIR ?? "database").replace(/^\/+|\/+$/g, "");
	const file = (dir ? `${dir}/${path}` : path).split("/").map(encodeURIComponent).join("/");
	const headers = {
		Authorization: `Bearer ${env.GITHUB_TOKEN}`,
		Accept: "application/vnd.github.raw",
		"X-GitHub-Api-Version": "2022-11-28",
		"User-Agent": "rtd-database-worker",
	};
	if(etag) headers["If-None-Match"] = etag;
	const res = await fetch(`https://api.github.com/repos/${repo}/contents/${file}?ref=${encodeURIComponent(env.DATA_REF || "main")}`, { headers });
	if(res.ok || res.status == 304 || res.status == 404) return res;
	throw new Error(`GitHub ${res.status}, rate limit remaining ${res.headers.get("x-ratelimit-remaining")}`);
}

async function fromKV(path, env){
	if(!env.DB_KV) return null;
	const { value, metadata } = await env.DB_KV.getWithMetadata(path, "arrayBuffer");
	return value ? { body: value, etag: metadata?.etag ?? null, checked: metadata?.checked ?? 0 } : null;
}

async function fromCache(path){
	const res = await caches.default.match(cacheKey(path)).catch(() => null);
	return res ? { body: await res.arrayBuffer(), etag: res.headers.get("etag"), checked: Number(res.headers.get("x-checked")) || 0 } : null;
}

async function store(path, file, env){
	const jobs = [caches.default.put(cacheKey(path), new Response(file.body.slice(0), {
		headers: { "Cache-Control": "public, max-age=31536000", ...(file.etag ? { ETag: file.etag } : {}), "x-checked": String(file.checked) },
	}))];
	if(env.DB_KV && file.body.byteLength <= KV_LIMIT) jobs.push(env.DB_KV.put(path, file.body, { metadata: { etag: file.etag, checked: file.checked } }));
	await Promise.allSettled(jobs);
}

function cacheKey(path){
	return new Request(`https://rtd-database.cache/${path}`);
}

function remember(path, file){
	const old = memory.get(path);
	if(old) memorySize -= old.body.byteLength;
	memory.delete(path);
	memory.set(path, file);
	memorySize += file.body.byteLength;
	for(const [key, value] of memory){
		if(memorySize <= MEMORY_LIMIT) break;
		memory.delete(key);
		memorySize -= value.body.byteLength;
	}
}

function touch(path, file){
	memory.delete(path);
	memory.set(path, file);
}

function corsHeaders(request, env){
	const allowed = (env.ALLOWED_ORIGINS || "*").split(",").map(s => s.trim()).filter(Boolean);
	if(allowed.includes("*")) return { "Access-Control-Allow-Origin": "*" };
	const origin = request.headers.get("Origin");
	return origin && allowed.includes(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : { Vary: "Origin" };
}

function text(body, status, headers){
	return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...headers } });
}
