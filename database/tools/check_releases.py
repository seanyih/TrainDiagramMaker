"""
Reminder for info.json: files in <line>/releases/ that no release in info.json lists (forgot to add them),
and files info.json lists that do not exist (typo, or not copied yet).

    python database/tools/check_releases.py           all countries
    python database/tools/check_releases.py tw        only these
"""
import sys

from common import DB, countries, line_dirs, read_json


def check(line_dir):
	releases = line_dir / "releases"
	files = {p.relative_to(line_dir).as_posix() for p in releases.rglob("*") if p.is_file()} if releases.is_dir() else set()
	if not (line_dir / "info.json").is_file():
		return [f"no info.json ({len(files)} files in releases/)"]
	info = read_json(line_dir / "info.json")
	listed = {file for section in ["route", "all"] for r in info.get(section, []) for file in r.get("files", {}).values()}
	return [f"not in info.json: {f}" for f in sorted(files - listed)] + [f"missing: {f}" for f in sorted(listed - files)]


def main():
	sys.stdout.reconfigure(encoding="utf-8")
	wanted = sys.argv[1:]
	found = 0
	for country in countries():
		if wanted and country["id"] not in wanted:
			continue
		for line_dir in line_dirs(country["id"]):
			for problem in check(line_dir):
				print(f"{line_dir.relative_to(DB).as_posix()}: {problem}")
				found += 1
	print(f"{found} problems" if found else "every release file is listed in info.json")
	sys.exit(1 if found else 0)


if __name__ == "__main__":
	main()
