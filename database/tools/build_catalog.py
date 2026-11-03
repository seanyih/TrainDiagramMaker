"""
Writes <country>/catalog.json (one row per line, for the search page) from every <country>/<line>/info.json,
in the order of <country>/order.txt (one line id per row; lines not listed go last, by id).
Checks each info.json first; a country with problems is not written and the script exits with 1.

    python database/tools/build_catalog.py           all countries in catalog.json
    python database/tools/build_catalog.py tw jp     only these
"""
import json
import re
import sys

from common import DB, SECTIONS, TYPES, countries, line_dirs, read_json

DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ID = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def names_ok(value):
	return isinstance(value, dict) and isinstance(value.get("zh"), str) and all(isinstance(v, str) and v for v in value.values())


def check_info(info, country):
	problems = []
	for key in ["name", "section"]:
		if not names_ok(info.get(key)):
			problems.append(f'{key} must be {{ "zh": "...", "en": "...", "ja": "..." }} (zh required)')
	companies = [c["id"] for c in country["companies"]]
	regions = [r["id"] for r in country["regions"]]
	if not info.get("companies"):
		problems.append("no companies")
	problems += [f"unknown company {c} (add it to catalog.json)" for c in info.get("companies", []) if c not in companies]
	problems += [f"unknown region {r} (add it to catalog.json)" for r in info.get("regions", []) if r not in regions]
	if not info.get("types"):
		problems.append("no types")
	problems += [f"unknown type {t} (one of {TYPES})" for t in info.get("types", []) if t not in TYPES]
	for section, rule in SECTIONS.items():
		releases = info.get(section, [])
		for r in releases:
			where = f"{section} {r.get('date', '?')}"
			if not DATE.match(str(r.get("date", ""))):
				problems.append(f"{where}: date must be yyyy-mm-dd")
			if not isinstance(r.get("title"), str):
				problems.append(f"{where}: no title")
			if "description" in r and not isinstance(r["description"], str):
				problems.append(f"{where}: description must be a string")
			if "solved" in r.get("tags", []) and "arrival" in r["tags"]:
				problems.append(f"{where}: solved implies arrival, remove arrival")
			if r.get("kind") not in rule["kinds"]:
				problems.append(f"{where}: kind must be one of {rule['kinds']}")
			problems += [f"{where}: unknown tag {t} (one of {rule['tags']})" for t in r.get("tags", []) if t not in rule["tags"]]
			if not r.get("files"):
				problems.append(f"{where}: no files")
			problems += [f"{where}: unknown format {f} (one of {rule['formats']})" for f in r.get("files", {}) if f not in rule["formats"]]
	return problems


def read_order(country_id):
	path = DB / country_id / "order.txt"
	if not path.is_file():
		return []
	rows = (row.split("#")[0].strip() for row in path.read_text(encoding="utf-8").splitlines())
	return [row for row in rows if row]


def build(country):
	cid = country["id"]
	rows = {}
	problems = []
	for line_dir in line_dirs(cid):
		lid = line_dir.name
		if not (line_dir / "info.json").is_file():
			print(f"  skip {cid}/{lid}: no info.json")
			continue
		if not ID.match(lid):
			problems.append(f"{cid}/{lid}: folder name must be lowercase a-z, 0-9 and -")
		try:
			info = read_json(line_dir / "info.json")
		except ValueError as e:
			problems.append(f"{cid}/{lid}/info.json: not valid JSON ({e})")
			continue
		problems += [f"{cid}/{lid}/info.json: {p}" for p in check_info(info, country)]
		rows[lid] = {key: info.get(key, []) for key in ["name", "section", "companies", "types", "regions"]}
	if problems:
		print("\n".join(problems))
		return False

	order = read_order(cid)
	for lid in order:
		if lid not in rows:
			print(f"  {cid}/order.txt: {lid} has no info.json, ignored")
	unlisted = sorted(lid for lid in rows if lid not in order)
	if unlisted:
		print(f"  {cid}/order.txt does not list {', '.join(unlisted)}: put last")
	ids = [lid for lid in order if lid in rows] + unlisted
	lines = ",\n".join(f'\t\t{{"id": "{lid}", {dumps_row(rows[lid])}}}' for lid in dict.fromkeys(ids))
	(DB / cid / "catalog.json").write_text(f'{{\n\t"lines": [\n{lines}\n\t]\n}}\n', encoding="utf-8", newline="\n")
	print(f"{cid}/catalog.json: {len(rows)} lines")
	return True


# one row per line keeps the diff readable
def dumps_row(row):
	return json.dumps(row, ensure_ascii=False)[1:-1]


def main():
	sys.stdout.reconfigure(encoding="utf-8")
	wanted = sys.argv[1:]
	ok = True
	for country in countries():
		if not wanted or country["id"] in wanted:
			ok &= build(country)
	sys.exit(0 if ok else 1)


if __name__ == "__main__":
	main()
