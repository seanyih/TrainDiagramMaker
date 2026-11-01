"""Shared by the database helpers. The database is database/ of this repo, served as is (no build)."""
import json
from pathlib import Path

DB = Path(__file__).resolve().parent.parent

TYPES = ["hsr", "railway", "narrow", "metro", "lrt", "other"]
SECTIONS = {
	"route": {"kinds": ["route"], "tags": ["mileage", "track", "topology", "complete"], "formats": ["json"]},
	"all": {"kinds": ["all", "timetable"], "tags": ["arrival", "solved"], "formats": ["json", "svg", "pdf"]},
}


def read_json(path):
	return json.loads(Path(path).read_text(encoding="utf-8"))


def countries():
	return read_json(DB / "catalog.json")["countries"]


def line_dirs(country_id):
	"""Every folder of the country that is a line (has info.json or releases/)."""
	return sorted(d for d in (DB / country_id).iterdir() if d.is_dir() and ((d / "info.json").is_file() or (d / "releases").is_dir()))


def latest(releases):
	"""The release marked latest, else the newest; None if there is none. Same as dbSortReleases() on the site."""
	if not releases:
		return None
	return next((r for r in releases if r.get("latest")), None) or max(releases, key=lambda r: r["date"])
