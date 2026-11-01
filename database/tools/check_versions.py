"""
Lines whose latest release is older than a date (to find what needs updating after a timetable change).
Checked separately for route (路線資料) and all (全部資料); a section without releases is shown as "none".

    python database/tools/check_versions.py 2026-07-01
    python database/tools/check_versions.py 2026-07-01 --section all --country tw
"""
import argparse
import sys

from common import countries, latest, line_dirs, read_json


def main():
	sys.stdout.reconfigure(encoding="utf-8")
	parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
	parser.add_argument("date", help="yyyy-mm-dd")
	parser.add_argument("--section", choices=["route", "all"], help="only this section (default: both)")
	parser.add_argument("--country", nargs="*", help="only these countries")
	args = parser.parse_args()
	sections = [args.section] if args.section else ["route", "all"]

	found = 0
	for country in countries():
		if args.country and country["id"] not in args.country:
			continue
		for line_dir in line_dirs(country["id"]):
			if not (line_dir / "info.json").is_file():
				continue
			info = read_json(line_dir / "info.json")
			for section in sections:
				release = latest(info.get(section, []))
				if release is None or release["date"] < args.date:
					print(f"{country['id']}/{line_dir.name:<32} {section:<5} {release['date'] if release else 'none'}  {info['name']['zh']}")
					found += 1
	print(f"{found} older than {args.date}" if found else f"every latest release is on or after {args.date}")


if __name__ == "__main__":
	main()
