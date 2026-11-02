"""
Merge changes of a route JSON into an all-data JSON (stations added or removed, track_layout, topology, route_name).
Stops are matched by station name: station_order and station_record of every train are remapped,
stops of stations that no longer exist are dropped. A renamed station counts as removed + added.

    python database/tools/merge_route.py route.json all.json
    python database/tools/merge_route.py route.json all.json --out merged.json
"""
import argparse
import json
import sys
from pathlib import Path

from common import read_json


def merge(route, all_data):
	old_names = [s["name"] for s in all_data["route"]["stations"]]
	names = [s["name"] for s in route["stations"]]
	print(f"stations: {len(old_names)} -> {len(names)}")
	for name in names:
		if name not in old_names:
			print(f"  added: {name}")
	for name in old_names:
		if name not in names:
			print(f"  removed: {name} (its stops are dropped)")

	for bound, data in all_data["trains"].items():
		new_record = names if bound == "1" else names[::-1]
		index = {name: i for i, name in enumerate(new_record)}
		for train in data["timetable"]:
			train["timetable"] = [dict(stop, station_order=index[stop["station_name"]]) for stop in train["timetable"] if stop["station_name"] in index]
		data["station_record"] = list(new_record)
		data["station_count"] = len(new_record)
		data["route_name"] = route["route_name"]

	all_data["route"] = route
	return all_data


def main():
	sys.stdout.reconfigure(encoding="utf-8")
	parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
	parser.add_argument("route", help="route JSON (the new one)")
	parser.add_argument("all", help="all-data JSON to update")
	parser.add_argument("--out", help="output file (default: overwrite the all-data JSON)")
	args = parser.parse_args()

	result = merge(read_json(args.route), read_json(args.all))
	Path(args.out or args.all).write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
	main()
