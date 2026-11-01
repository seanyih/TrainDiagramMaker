"""
Checks the database feature from the data files to the rendered pages. Needs only Python 3 and Edge or Chrome (headless, no installs).

    python test/database_check.py                 everything
    python test/database_check.py -k browser      only tests whose name contains "browser"
    python test/database_check.py --all-lines     render every line page (default: a sample)
    python test/database_check.py --no-browser    skip the tests that need Edge / Chrome
    python test/database_check.py --data <folder> data repo (default: found next to this repo, see database_dev.py)
    python test/database_check.py --show-dom <url>  print what the browser makes of a page (for debugging)

Groups: static (files the pages load), data (build.py, release.py, dist/ content), http (what the servers answer),
browser (pages rendered in headless Edge, compared with dist/). Exit code 1 if anything fails.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parent))
import database_dev as dev

SITE = dev.SITE_ROOT
FAST = "127.0.0.1"  # python-side requests: "localhost" costs 2 s on Windows when ::1 is tried first
PAGE_SIZE = 50  # DB_PAGE_SIZE in dbSearch.js
DB_JS = (SITE / "program/util/database.js").read_text(encoding="utf-8")
BROWSERS = [
	r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
	r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
	r"C:\Program Files\Google\Chrome\Application\chrome.exe",
	r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
	"/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]

ctx = {}  # data_repo, dist, catalog, browser
tests = []


def test(group):
	def register(fn):
		tests.append((group, fn.__name__.replace("_", " "), fn))
		return fn
	return register


class Fail(Exception):
	pass


def expect(condition, message):
	if not condition:
		raise Fail(message)


def js_regex(name):
	"""The regex literal of a const in database.js, as a Python regex."""
	return re.compile(re.search(rf"const {name} = /(.*)/;", DB_JS).group(1))


def get(path_or_url, base=dev.SITE_URL):
	url = path_or_url if path_or_url.startswith("http") else f"{base}{path_or_url}"
	return dev.fetch(url.replace("localhost", FAST))


def data_json(path):
	status, _, body = get(path, dev.DATA_URL)
	expect(status == 200, f"{path} answered {status}")
	return json.loads(body)


# ---------- headless browser ----------

def find_browser():
	return next((b for b in BROWSERS if Path(b).is_file()), None) or shutil.which("msedge") or shutil.which("chrome")


class Page:
	def __init__(self, html, log):
		self.html = html
		self.log = log

	def tag(self, element_id):
		m = re.search(rf'<[^>]*\bid="{element_id}"[^>]*>', self.html)
		return m.group(0) if m else ""

	def count(self, css_class):
		return sum(css_class in classes.split() for classes in re.findall(r'class="([^"]*)"', self.html))

	def visible(self, element_id):
		tag = self.tag(element_id)
		return bool(tag) and "db-hidden" not in tag.split('class="')[-1].split('"')[0].split()

	def text(self, element_id):
		m = re.search(rf'<[^>]*\bid="{element_id}"[^>]*>(.*?)</(?:p|div|ul|header)>', self.html, re.S)
		return re.sub(r"<[^>]+>", "", m.group(1)).strip() if m else ""

	def all(self, pattern):
		return re.findall(pattern, self.html)

	def shown_toasts(self):
		toasts = set()
		for tag in re.findall(r'<div[^>]*\bclass="toast[^"]*"[^>]*>', self.html):
			classes = re.search(r'class="([^"]*)"', tag).group(1).split()
			if "show" in classes:
				toasts.add(re.search(r'\bid="(\w+)"', tag).group(1))
		return toasts

	def js_errors(self):
		return [l for l in self.log if re.search(r"Uncaught|Failed to load resource|ERR_|is not defined|is not a function", l) and "favicon" not in l]


def render(path, wait=8000):
	"""Opens a site path in headless Edge / Chrome and returns the DOM after the scripts ran."""
	url = f"{dev.SITE_URL}{path}"
	for attempt in range(4):
		profile = tempfile.mkdtemp(prefix="rtd-browser-")
		args = ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-sync",
			"--disable-background-networking", f"--user-data-dir={profile}", f"--virtual-time-budget={wait}", "--enable-logging=stderr", "--v=0", "--dump-dom"]
		# On Windows Edge cuts an unquoted URL at "&", so every filter after the first would silently be dropped
		command = f'"{ctx["browser"]}" {" ".join(args)} "{url}"' if os.name == "nt" else [ctx["browser"], *args, url]
		try:
			result = subprocess.run(command, capture_output=True, timeout=60)
		finally:
			shutil.rmtree(profile, ignore_errors=True)
		html = result.stdout.decode("utf-8", "replace")
		# a fresh profile sometimes dumps the browser's own new-tab page instead of ours: try again
		if "Train Diagram Maker</title>" in html or "Train Diagram Maker - " in html:
			break
	log = [l for l in result.stderr.decode("utf-8", "replace").splitlines() if "CONSOLE" in l and "Tracking Prevention" not in l and "ProtocolLaunch" not in l]
	return Page(html, log)


def need_browser():
	expect(ctx.get("browser"), "no Edge / Chrome found (use --no-browser to skip these tests)")


# ---------- static ----------

REF = re.compile(r'(?:src|href)="([^"#?]+)')


def strip_comments(html):
	return re.sub(r"<!--.*?-->", "", html, flags=re.S)


def local_refs(html_file):
	for ref in REF.findall(strip_comments(html_file.read_text(encoding="utf-8"))):
		if re.match(r"^(https?:|//|data:|mailto:|javascript:)", ref):
			continue
		yield ref


@test("static")
def pages_load_only_files_that_exist():
	pages = ["zh/database/index.html", "zh/database/line.html", "zh/diagram-maker.html", "zh/index.html", "zh/manual/manual-index.html"]
	missing = []
	for page in pages:
		path = SITE / page
		expect(path.is_file(), f"{page} does not exist (are you on the feat/database branch?)")
		for ref in local_refs(path):
			target = (path.parent / ref).resolve()
			if target.is_dir():
				target /= "index.html"
			if not target.is_file():
				missing.append(f"{page} -> {ref}")
	expect(not missing, "missing files:\n    " + "\n    ".join(missing))


@test("static")
def database_is_linked_from_every_header_and_the_landing_page():
	for page, link in [("zh/diagram-maker.html", "database/"), ("zh/index.html", "database/"), ("zh/manual/manual-index.html", "../database/")]:
		expect(f'href="{link}"' in (SITE / page).read_text(encoding="utf-8"), f"{page} has no link to {link}")
	expect("../database/" in (SITE / "zh/manual/template.html").read_text(encoding="utf-8"), "manual template has no database link (manual pages are built from it)")


@test("static")
def script_load_order_defines_what_each_page_uses():
	# names a script uses from another file must be declared by a script the page loads before it
	needs = {
		"zh/database/index.html": {"dbSearch.js": ["dbFetchJSON", "dbName", "escapeHTML", "currentLang", "DB_SEARCH_KEY"]},
		"zh/database/line.html": {"dbLine.js": ["dbFetchJSON", "dbName", "dbDownload", "escapeHTML", "currentLang", "DB_LINE_ID", "DB_SEARCH_KEY"]},
		"zh/diagram-maker.html": {"DatabaseHandler.js": ["DB_BASE", "DB_FILE", "applyRoute", "loadRouteFromJSON", "loadAllFromJSON", "generateTimetable"]},
	}
	for page, scripts in needs.items():
		html = strip_comments((SITE / page).read_text(encoding="utf-8"))
		order = [(m.group(1), (SITE / page).parent / m.group(1)) for m in re.finditer(r'<script src="((?!https?:)[^"]+)"', html)]
		for script, names in scripts.items():
			index = next(i for i, (ref, _) in enumerate(order) if ref.endswith(script))
			earlier = "\n".join(p.read_text(encoding="utf-8") for _, p in order[:index] if p.is_file())
			for name in names:
				declared = re.search(rf"(function\s+{name}\b|(?:const|let|var)\s+{name}\b)", earlier)
				expect(declared, f"{script} uses {name}, but no script loaded before it in {page} declares it")


# ---------- data ----------

def fixture_repo(tmp):
	"""A tiny data repo to run build.py / release.py on."""
	repo = Path(tmp) / "repo"
	shutil.copytree(ctx["data_repo"] / "tools", repo / "tools", ignore=shutil.ignore_patterns("__pycache__"))
	shutil.copy(ctx["data_repo"] / "_headers", repo / "_headers")
	line = repo / "xx" / "line-a"
	line.mkdir(parents=True)
	(repo / "xx" / "country.json").write_text(json.dumps({
		"flag": "X", "name": {"zh": "測試"}, "regions": [{"id": "r1", "name": {"zh": "區"}}], "companies": [{"id": "co", "name": {"zh": "公司"}}]}), encoding="utf-8")
	route = {"route_name": "A", "stations": [{"name": "甲", "kilo": 0, "stopsec": 60, "alias": ""}, {"name": "乙", "kilo": 2, "stopsec": 60, "alias": ""}]}
	(line / "route.json").write_text(json.dumps(route, ensure_ascii=False), encoding="utf-8")
	info = {"name": "A線", "companies": ["co"], "section": "甲 – 乙", "types": ["railway"], "regions": ["r1"], "route": [], "all": []}
	(line / "info.json").write_text(json.dumps(info, ensure_ascii=False), encoding="utf-8")
	return repo


def run_py(repo, script, *args):
	return subprocess.run([sys.executable, str(repo / "tools" / script), *args], cwd=repo, capture_output=True, text=True, encoding="utf-8")


@test("data")
def build_succeeds_on_the_real_data():
	result = run_py(ctx["data_repo"], "build.py")
	expect(result.returncode == 0, f"build.py failed:\n{result.stdout}{result.stderr}")
	ctx["dist"] = ctx["data_repo"] / "dist"
	ctx["catalog"] = json.loads((ctx["dist"] / "catalog.json").read_text(encoding="utf-8"))
	expect(ctx["catalog"]["countries"], "dist/catalog.json lists no country")


@test("data")
def release_py_adds_a_release_and_moves_latest():
	with tempfile.TemporaryDirectory() as tmp:
		repo = fixture_repo(tmp)
		result = run_py(repo, "release.py", "xx/line-a", "route", "2026-01-01", "first")
		expect(result.returncode == 0, result.stdout + result.stderr)
		result = run_py(repo, "release.py", "xx/line-a", "route", "2026-02-01", "second")
		expect(result.returncode == 0, result.stdout + result.stderr)
		result = run_py(repo, "release.py", "xx/line-a", "route", "2025-12-01", "older", "--keep-latest")
		expect(result.returncode == 0, result.stdout + result.stderr)
		info = json.loads((repo / "xx/line-a/info.json").read_text(encoding="utf-8"))
		expect([r["date"] for r in info["route"] if r.get("latest")] == ["2026-02-01"], "exactly the 2026-02-01 release should be latest (--keep-latest keeps it)")
		expect(all(r["tags"] == ["mileage"] for r in info["route"]), f"tags are detected from the data, got {[r['tags'] for r in info['route']]}")
		expect((repo / "xx/line-a/releases/route-2026-02-01.json").is_file(), "release file was not copied")
		result = run_py(repo, "build.py")
		expect(result.returncode == 0, "build.py rejects what release.py wrote:\n" + result.stdout + result.stderr)
		published = json.loads((repo / "dist/xx/line-a/info.json").read_text(encoding="utf-8"))
		expect([r["date"] for r in published["route"]] == ["2026-02-01", "2026-01-01", "2025-12-01"], "dist/ info.json: latest first, then newest to oldest")


@test("data")
def build_rejects_bad_data_and_says_why():
	cases = [
		("unknown company", lambda i: i.update(companies=["nope"]), "unknown company nope"),
		("unknown region", lambda i: i.update(regions=["nope"]), "unknown region nope"),
		("unknown type", lambda i: i.update(types=["rocket"]), "unknown type rocket"),
		("bad date", lambda i: i["route"].append({"date": "2026/1/1", "title": "t", "files": {"json": "releases/route-x.json"}}), "date must be yyyy-mm-dd"),
		("unknown tag", lambda i: i["route"].append({"date": "2026-01-01", "title": "t", "tags": ["shiny"], "files": {"json": "route.json"}}), "unknown tag shiny"),
		("missing file", lambda i: i["route"].append({"date": "2026-01-01", "title": "t", "files": {"json": "releases/nothing.json"}}), "does not exist"),
		("file outside the line folder", lambda i: i["route"].append({"date": "2026-01-01", "title": "t", "files": {"json": "../country.json"}}), "outside the line folder"),
		("two latest", lambda i: i["route"].extend({"date": f"2026-01-0{n}", "title": "t", "latest": True, "files": {"json": "route.json"}} for n in (1, 2)), "more than one latest"),
		("format not allowed for route", lambda i: i["route"].append({"date": "2026-01-01", "title": "t", "files": {"pdf": "route.json"}}), "unknown format pdf"),
	]
	with tempfile.TemporaryDirectory() as tmp:
		for name, mutate, message in cases:
			repo = fixture_repo(Path(tmp) / re.sub(r"\W", "", name))
			path = repo / "xx/line-a/info.json"
			info = json.loads(path.read_text(encoding="utf-8"))
			mutate(info)
			path.write_text(json.dumps(info, ensure_ascii=False), encoding="utf-8")
			result = run_py(repo, "build.py")
			expect(result.returncode == 1, f"{name}: build.py should fail (exit {result.returncode})")
			expect(message in result.stdout, f"{name}: expected the message '{message}', got:\n{result.stdout}")


@test("data")
def dist_is_complete_and_consistent():
	dist = ctx["dist"]
	line_id, file_pattern = js_regex("DB_LINE_ID"), js_regex("DB_FILE")
	problems = []
	total = 0
	for country in ctx["catalog"]["countries"]:
		rows = json.loads((dist / country["id"] / "catalog.json").read_text(encoding="utf-8"))["lines"]
		if len(rows) != country["lines"]:
			problems.append(f"{country['id']}: catalog.json says {country['lines']} lines, country catalog has {len(rows)}")
		for key in ["flag", "name", "regions", "companies"]:
			if key not in country:
				problems.append(f"{country['id']}: catalog.json lacks {key}")
		company_ids = {c["id"] for c in country["companies"]}
		region_ids = {r["id"] for r in country["regions"]}
		for row in rows:
			total += 1
			where = f"{country['id']}/{row['id']}"
			if not line_id.match(where):
				problems.append(f"{where}: does not match DB_LINE_ID, the line page would refuse it")
			info_path = dist / country["id"] / row["id"] / "info.json"
			if not info_path.is_file():
				problems.append(f"{where}: info.json missing in dist")
				continue
			info = json.loads(info_path.read_text(encoding="utf-8"))
			for company in row["companies"]:
				if company not in company_ids:
					problems.append(f"{where}: company {company} not in country.json")
			for region in row["regions"]:
				if region not in region_ids:
					problems.append(f"{where}: region {region} not in country.json")
			if not row["stations"] and info["route"]:
				problems.append(f"{where}: has a route release but no stations in the search index")
			for section in ["route", "all"]:
				releases = info[section]
				if releases and sum(1 for r in releases if r.get("latest")) != 1:
					problems.append(f"{where}: {section} needs exactly one latest")
				if releases and not releases[0].get("latest"):
					problems.append(f"{where}: {section}: the latest release is not listed first")
				dates = [r["date"] for r in releases[1:]]
				if dates != sorted(dates, reverse=True):
					problems.append(f"{where}: {section}: older releases are not newest first")
				for release in releases:
					for fmt, file in release["files"].items():
						path = dist / country["id"] / row["id"] / file
						rel = f"{where}/{file}"
						if not file_pattern.match(rel):
							problems.append(f"{rel}: does not match DB_FILE, 開始製作 would refuse it")
						if not path.is_file() or path.stat().st_size == 0:
							problems.append(f"{rel}: missing or empty")
						elif fmt == "json":
							data = json.loads(path.read_text(encoding="utf-8"))
							if section == "route" and not (isinstance(data.get("stations"), list) and data["stations"]):
								problems.append(f"{rel}: not a route JSON (no stations)")
							if section == "all" and not ({"trains"} <= set(data) and (release["kind"] == "timetable" or "route" in data)):
								problems.append(f"{rel}: not an all-data JSON (needs trains and route)")
						elif not zipfile.is_zipfile(path):
							problems.append(f"{rel}: not a zip")
			unknown = {p.name for p in (dist / country["id"] / row["id"]).iterdir()} - {"info.json", "releases"}
			if unknown:
				problems.append(f"{where}: working files leaked into dist: {sorted(unknown)}")
	expect(not problems, f"{len(problems)} problems:\n    " + "\n    ".join(problems[:30]))
	expect(total > 0, "no lines at all")


@test("data")
def search_index_matches_the_route_files():
	problems = []
	for country in ctx["catalog"]["countries"]:
		for row in json.loads((ctx["dist"] / country["id"] / "catalog.json").read_text(encoding="utf-8"))["lines"]:
			info = json.loads((ctx["dist"] / country["id"] / row["id"] / "info.json").read_text(encoding="utf-8"))
			if info["route"]:
				route = json.loads((ctx["dist"] / country["id"] / row["id"] / info["route"][0]["files"]["json"]).read_text(encoding="utf-8"))
				if [s["name"] for s in route["stations"]] != row["stations"]:
					problems.append(f"{country['id']}/{row['id']}: search index stations differ from the latest route release")
	expect(not problems, "\n    ".join(problems))


# ---------- http ----------

@test("http")
def servers_answer_every_page_and_file():
	for path in ["/zh/database/", "/zh/database/index.html", "/zh/database/line.html", "/zh/diagram-maker.html", "/program/util/database.js", "/program/ui/database.css",
				"/zh/program/ui/dbSearch.js", "/zh/program/ui/dbLine.js", "/program/handler/DatabaseHandler.js"]:
		status = get(path)[0]
		expect(status == 200, f"site {path} answered {status}")
	for country in ctx["catalog"]["countries"]:
		for path in [f"/{country['id']}/catalog.json"]:
			expect(get(path, dev.DATA_URL)[0] == 200, f"data {path} is not served")


@test("http")
def data_is_readable_from_the_site_origin_and_cached_sensibly():
	status, headers, _ = get("/catalog.json", dev.DATA_URL)
	expect(status == 200, f"catalog.json answered {status}")
	expect(headers.get("Access-Control-Allow-Origin") == "*", "no CORS header: the site (another origin) could not read the data")
	headers_file = (ctx["dist"] / "_headers").read_text(encoding="utf-8")
	expect("Access-Control-Allow-Origin: *" in headers_file, "dist/_headers has no CORS rule (Cloudflare Pages)")


@test("http")
def unknown_and_escaping_paths_are_404():
	for base, path in [(dev.DATA_URL, "/nope.json"), (dev.DATA_URL, "/tw/nope/info.json"), (dev.SITE_URL, "/zh/database/nope.html"),
					(dev.DATA_URL, "/../README.md"), (dev.DATA_URL, "/%2e%2e/README.md"), (dev.DATA_URL, "/tw/route.json"), (dev.DATA_URL, "/jp/crawler/chromedriver.exe")]:
		status = get(path, base)[0]
		expect(status in (403, 404), f"{base}{path} answered {status}, expected 404")


# ---------- browser ----------

def country_rows(country_id):
	return json.loads((ctx["dist"] / country_id / "catalog.json").read_text(encoding="utf-8"))["lines"]


def line_names(page):
	return [re.sub(r"<[^>]+>", "", m) for m in page.all(r"<strong>(.*?)</strong>")]


@test("browser")
def search_page_opens_on_the_first_country_without_errors():
	need_browser()
	page = render("/zh/database/")
	first = ctx["catalog"]["countries"][0]
	expect(not page.js_errors(), "console errors:\n    " + "\n    ".join(page.js_errors()))
	expect(page.count("db-line") == min(PAGE_SIZE, first["lines"]), f"{page.count('db-line')} rows, expected {min(PAGE_SIZE, first['lines'])} ({first['id']})")
	expect(page.count("db-option") >= len(ctx["catalog"]["countries"]), "country list not rendered")
	expect(first["flag"] in page.html, "flag not rendered")
	expect('aria-pressed="true"' in page.html, "no selected country")


@test("browser")
def every_country_lists_its_lines_and_filters_match_the_data():
	need_browser()
	problems = []
	for country in ctx["catalog"]["countries"]:
		rows = country_rows(country["id"])
		page = render(f"/zh/database/?c={country['id']}")
		if page.count("db-line") != min(PAGE_SIZE, len(rows)):
			problems.append(f"{country['id']}: {page.count('db-line')} rows, expected {min(PAGE_SIZE, len(rows))}")
		if page.js_errors():
			problems.append(f"{country['id']}: console errors {page.js_errors()[:2]}")
		combos = [(f"r={r['id']}", [x for x in rows if r["id"] in x["regions"]]) for r in country["regions"]]
		combos += [(f"t={t}", [x for x in rows if t in x["types"]]) for t in sorted({t for x in rows for t in x["types"]})]
		combos += [(f"co={c['id']}", [x for x in rows if c["id"] in x["companies"]]) for c in country["companies"]]
		for query, expected in combos:
			page = render(f"/zh/database/?c={country['id']}&{query}")
			names = line_names(page)
			if names != [x["name"] for x in expected][:PAGE_SIZE]:
				problems.append(f"{country['id']} {query}: showed {names[:3]}... ({len(names)}), expected {[x['name'] for x in expected][:3]}... ({len(expected)})")
	expect(not problems, f"{len(problems)} problems:\n    " + "\n    ".join(problems[:20]))


@test("browser")
def text_search_finds_names_stations_and_companies_and_treats_tai_alike():
	need_browser()
	page_a, page_b = render("/zh/database/?c=tw&q=" + quote("台中")), render("/zh/database/?c=tw&q=" + quote("臺中"))
	expect(line_names(page_a), "searching 台中 (a station name) found nothing")
	expect(line_names(page_a) == line_names(page_b), "台 and 臺 give different results")
	rows = country_rows("tw")
	norm = lambda text: text.replace("臺", "台")
	expected = {r["name"] for r in rows if any("台中" in norm(s) for s in r["stations"]) or "台中" in norm(r["name"])}
	expect(set(line_names(page_a)) == expected, f"station search showed {sorted(line_names(page_a))}, expected {sorted(expected)}")
	company = render("/zh/database/?c=tw&q=" + quote("高雄捷運"))
	expect(set(line_names(company)) == {r["name"] for r in rows if "krtc" in r["companies"]}, f"company search showed {line_names(company)}")
	none = render("/zh/database/?c=tw&q=zzzz-no-such-line")
	expect(not line_names(none), "nonsense query still lists lines")
	expect(none.visible("DbMessage") and "沒有符合" in none.text("DbMessage"), "no 'no results' message")


@test("browser")
def unknown_country_or_filter_in_the_url_does_not_break_the_page():
	need_browser()
	page = render("/zh/database/?c=zz&r=nope&t=rocket&co=nobody")
	expect(not page.js_errors(), f"console errors: {page.js_errors()}")
	expect(page.count("db-option") > 0, "the page did not render the country list")


def sample_lines():
	lines = []
	for country in ctx["catalog"]["countries"]:
		rows = country_rows(country["id"])
		if ctx["all_lines"]:
			lines += [(country["id"], r["id"]) for r in rows]
			continue
		def releases(r):
			info = json.loads((ctx["dist"] / country["id"] / r["id"] / "info.json").read_text(encoding="utf-8"))
			return len(info["route"]) + len(info["all"])
		picks = {rows[0]["id"], rows[-1]["id"], max(rows, key=releases)["id"]}
		lines += [(country["id"], i) for i in sorted(picks)]
	return lines


@test("browser")
def line_pages_show_every_release_and_download():
	need_browser()
	problems = []
	for country_id, line_id in sample_lines():
		info = json.loads((ctx["dist"] / country_id / line_id / "info.json").read_text(encoding="utf-8"))
		page = render(f"/zh/database/line.html?id={country_id}/{line_id}")
		where = f"{country_id}/{line_id}"
		if page.js_errors():
			problems.append(f"{where}: console errors {page.js_errors()[:2]}")
		if info["name"] not in re.sub(r"<[^>]+>", "", page.text("DbLine")):
			problems.append(f"{where}: title '{info['name']}' not shown")
		releases = info["route"] + info["all"]
		if page.count("db-release") != len(releases):
			problems.append(f"{where}: {page.count('db-release')} release rows, expected {len(releases)}")
		if page.count("db-file") != sum(len(r["files"]) for r in releases):
			problems.append(f"{where}: {page.count('db-file')} download buttons, expected {sum(len(r['files']) for r in releases)}")
		if page.count("db-older") != (int(len(info["route"]) > 1) + int(len(info["all"]) > 1)):
			problems.append(f"{where}: older releases are not split from the latest")
		start = page.all(r'class="db-start" href="([^"]+)"')
		expected = [f"../diagram-maker.html?db={country_id}/{line_id}/{info['route'][0]['files']['json']}"] if info["route"] else []
		if start != expected:
			problems.append(f"{where}: 開始製作 link {start}, expected {expected}")
		if page.count("db-tag") != sum(len(r["tags"]) + 1 for r in releases):
			problems.append(f"{where}: {page.count('db-tag')} tags, expected {sum(len(r['tags']) + 1 for r in releases)}")
		if "Back" not in page.html or 'id="DbBack"' not in page.html:
			problems.append(f"{where}: no Back button")
		if info.get("sources") and "時刻表來源" not in page.html:
			problems.append(f"{where}: sources not shown")
	expect(not problems, f"{len(problems)} problems:\n    " + "\n    ".join(problems[:20]))


@test("browser")
def line_page_with_a_bad_or_missing_id_says_so():
	need_browser()
	for query in ["", "?id=", "?id=../../etc/passwd", "?id=tw/does-not-exist", "?id=xx/yy"]:
		page = render("/zh/database/line.html" + query)
		expect(page.visible("DbMessage") and "找不到" in page.text("DbMessage"), f"line.html{query}: no 'not found' message (message: '{page.text('DbMessage')}')")
		expect(page.count("db-release") == 0, f"line.html{query}: showed releases")


@test("browser")
def start_button_imports_into_the_editor():
	need_browser()
	problems = []
	for country_id, line_id in sample_lines()[:3]:
		info = json.loads((ctx["dist"] / country_id / line_id / "info.json").read_text(encoding="utf-8"))
		if not info["route"]:
			continue
		route_file = info["route"][0]["files"]["json"]
		route = json.loads((ctx["dist"] / country_id / line_id / route_file).read_text(encoding="utf-8"))
		page = render(f"/zh/diagram-maker.html?db={country_id}/{line_id}/{route_file}", wait=3000)
		stations = page.all(r'data-field="name" value="([^"]*)"')
		if len(stations) != len(route["stations"]) or not all(stations):
			problems.append(f"{country_id}/{line_id}: editor has {len(stations)} stations, route has {len(route['stations'])}")
		if "ImportRouteSuccess" not in page.shown_toasts():
			problems.append(f"{country_id}/{line_id}: no success toast")
		if page.js_errors():
			problems.append(f"{country_id}/{line_id}: console errors {page.js_errors()[:2]}")
	expect(not problems, "\n    ".join(problems))


@test("browser")
def all_data_release_imports_all_operation_modes():
	need_browser()
	for country_id in [c["id"] for c in ctx["catalog"]["countries"]]:
		for row in country_rows(country_id):
			info = json.loads((ctx["dist"] / country_id / row["id"] / "info.json").read_text(encoding="utf-8"))
			full = [r for r in info["all"] if r["kind"] == "all"]
			if not full:
				continue
			file = full[0]["files"]["json"]
			data = json.loads((ctx["dist"] / country_id / row["id"] / file).read_text(encoding="utf-8"))
			page = render(f"/zh/diagram-maker.html?db={country_id}/{row['id']}/{file}", wait=4000)
			expect("ImportAllSuccess" in page.shown_toasts(), f"{country_id}/{row['id']}: all-data import gave no success toast {sorted(page.shown_toasts())}")
			expect(len(page.all(r'data-field="name" value="([^"]*)"')) == len(data["route"]["stations"]), "route not imported with the all-data file")
			expect(not page.js_errors(), f"console errors: {page.js_errors()}")
			return
	raise Fail("no line has an all-data release to test")


@test("browser")
def start_with_a_bad_path_is_refused():
	need_browser()
	for path in ["../../README.md", "tw/x/releases/a.html", "//evil.example/x.json", "tw/tra-01-north-trunk/route.json", "tw/nope/releases/none.json"]:
		page = render("/zh/diagram-maker.html?db=" + quote(path, safe="/"), wait=3000)
		expect("ImportRouteFailed" in page.shown_toasts(), f"?db={path} was not refused (toasts: {sorted(page.shown_toasts())})")
		expect(not any(page.all(r'data-field="name" value="([^"]*)"')), f"?db={path} imported something")


# ---------- runner ----------

def main():
	sys.stdout.reconfigure(line_buffering=True, encoding="utf-8")
	parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
	parser.add_argument("-k", help="only tests whose group or name contains this")
	parser.add_argument("--data")
	parser.add_argument("--no-browser", action="store_true")
	parser.add_argument("--all-lines", action="store_true")
	parser.add_argument("--show-dom", metavar="URL_PATH", help='e.g. "/zh/database/?c=jp" (prints the DOM and console)')
	args = parser.parse_args()

	try:
		dev.check_site()
		ctx["data_repo"] = dev.find_data_repo(args.data)
		print(f"site: {SITE}\ndata: {ctx['data_repo']}")
		print("build:", dev.build_data(ctx["data_repo"]))
		servers = dev.start_servers(ctx["data_repo"])
	except dev.Problem as e:
		print(f"\nSETUP FAILED: {e}")
		sys.exit(1)
	ctx["browser"] = None if args.no_browser else find_browser()
	ctx["all_lines"] = args.all_lines
	ctx["dist"] = ctx["data_repo"] / "dist"
	ctx["catalog"] = json.loads((ctx["dist"] / "catalog.json").read_text(encoding="utf-8"))
	if args.show_dom:
		ctx["browser"] = find_browser()
		page = render(args.show_dom)
		print("\n".join(page.log) + "\n" + page.html)
		return

	results = []
	print()
	for group, name, fn in tests:
		if args.k and args.k not in group and args.k not in name:
			continue
		if group == "browser" and args.no_browser:
			continue
		started = time.time()
		try:
			fn()
			status, detail = "PASS", ""
		except Fail as e:
			status, detail = "FAIL", str(e)
		except Exception as e:
			status, detail = "ERROR", f"{type(e).__name__}: {e}"
		results.append(status)
		print(f"{status:5} {group:7} {name}  ({time.time() - started:.1f}s)")
		if detail:
			print("      " + detail.replace("\n", "\n      "))
	for server in servers:
		server.shutdown()
	failed = sum(1 for r in results if r != "PASS")
	print(f"\n{len(results) - failed}/{len(results)} passed" + ("" if ctx["browser"] or args.no_browser else "  (browser tests failed: no Edge / Chrome)"))
	sys.exit(1 if failed else 0)


if __name__ == "__main__":
	main()
