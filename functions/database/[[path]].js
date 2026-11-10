/*
	/database/* -> database/ of the private repo TrainDiagramMaker_data (Cloudflare Pages Function).
	The site keeps reading DB_BASE = "/database" (program/util/database.js) on its own origin.

	Settings (Pages project > Settings > Variables and Secrets):
		GITHUB_TOKEN   secret: fine-grained token, only TrainDiagramMaker_data, Contents: Read-only
		DATA_REPO      default "seanyih/TrainDiagramMaker_data"
		DATA_REF       default "main" (branch, tag or commit)
		DATA_DIR       default "database" (the folder in that repo served as /database/)

	GitHub allows a token 5,000 requests per hour, so every file is kept in Cloudflare's cache:
	releases/* never change (1 year), the rest (catalog.json, info.json) for 5 minutes.
*/
const PATH = /^(?:[a-z0-9-]+\/){0,2}(?:releases\/)?[\w.-]+$/;
const RELEASE = /^[a-z0-9-]+\/[a-z0-9-]+\/releases\/[\w.-]+$/;
const TYPES = { json: "application/json; charset=utf-8", zip: "application/zip", svg: "image/svg+xml", pdf: "application/pdf" };
const SHORT = 300;
const LONG = 31536000;

export async function onRequest(context){
	const { request, env, params } = context;
	if(request.method != "GET" && request.method != "HEAD") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });

	const path = [].concat(params.path ?? []).join("/");
	if(!PATH.test(path) || path.split("/").some(p => p.startsWith("."))) return new Response("Not Found", { status: 404 });
	const ext = path.split(".").pop().toLowerCase();
	if(!(ext in TYPES)) return new Response("Not Found", { status: 404 });

	// one cache entry per file (no query string, so ?x=1 cannot bypass the cache)
	const cache = caches.default;
	const key = new Request(new URL(`/database/${path}`, request.url), { method: "GET" });
	let res = await cache.match(key);
	if(!res){
		res = await fromGitHub(path, ext, env);
		if(res.ok || res.status == 404) context.waitUntil(cache.put(key, res.clone()));
	}
	return request.method == "HEAD" ? new Response(null, res) : res;
}

async function fromGitHub(path, ext, env){
	if(!env.GITHUB_TOKEN) return new Response("GITHUB_TOKEN is not set", { status: 500 });
	const repo = env.DATA_REPO || "seanyih/TrainDiagramMaker_data";
	const ref = env.DATA_REF || "main";
	const dir = (env.DATA_DIR ?? "database").replace(/^\/+|\/+$/g, "");
	const file = (dir ? `${dir}/${path}` : path).split("/").map(encodeURIComponent).join("/");

	const gh = await fetch(`https://api.github.com/repos/${repo}/contents/${file}?ref=${encodeURIComponent(ref)}`, {
		headers: {
			Authorization: `Bearer ${env.GITHUB_TOKEN}`,
			Accept: "application/vnd.github.raw",
			"X-GitHub-Api-Version": "2022-11-28",
			"User-Agent": "rtd-database-proxy",
		},
	});
	if(gh.status == 404) return new Response("Not Found", { status: 404, headers: { "Cache-Control": `public, max-age=60, s-maxage=${SHORT}` } });
	if(!gh.ok){
		// 401/403/429: bad token or rate limited; not cached, so it recovers by itself
		console.log(`GitHub ${gh.status} for ${path}, remaining ${gh.headers.get("x-ratelimit-remaining")}`);
		return new Response("Database unavailable", { status: 502, headers: { "Cache-Control": "no-store" } });
	}
	const age = RELEASE.test(path) ? `public, max-age=${LONG}, immutable` : `public, max-age=${SHORT}, s-maxage=${SHORT}`;
	return new Response(gh.body, {
		headers: {
			"Content-Type": TYPES[ext],
			"Cache-Control": age,
			"X-Content-Type-Options": "nosniff",
			...(gh.headers.get("etag") ? { ETag: gh.headers.get("etag") } : {}),
		},
	});
}
