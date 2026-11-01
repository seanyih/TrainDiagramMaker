"""
One command for the database pages: builds the data repo, then serves the site (8765) and the data (8766) together,
and checks every URL it should answer. Prints the reason for a 404 instead of leaving you to guess.

    python test/database_dev.py                 find the data repo next to this one
    python test/database_dev.py --data C:\\web\\RTD_data_database
    python test/database_dev.py --open          also open the browser
    python test/database_dev.py --no-build      serve the existing dist/ of the data repo

Ports are fixed: DB_BASE in program/util/database.js points to localhost:8766 when the site runs on localhost.
"""
import argparse
import http.server
import json
import os
import socket
import subprocess
import sys
import threading
import urllib.error
import urllib.request
import webbrowser
from functools import partial
from pathlib import Path

SITE_ROOT = Path(__file__).resolve().parent.parent
SITE_PORT = 8765
DATA_PORT = 8766
SITE_URL = f"http://localhost:{SITE_PORT}"
DATA_URL = f"http://localhost:{DATA_PORT}"
DATA_CANDIDATES = ["RTD_data_database", "RTD_data", "TrainDiagramMaker_data"]


class Problem(Exception):
	pass


def find_data_repo(given=None):
	candidates = [Path(given)] if given else [p for name in [os.environ.get("RTD_DATA"), *DATA_CANDIDATES] if name for p in [SITE_ROOT.parent / name, Path(name)]]
	for path in candidates:
		if (path / "tools" / "build.py").is_file():
			return path.resolve()
	tried = "\n".join(f"  {p}" for p in candidates)
	raise Problem(
		"Cannot find the data repo (a folder with tools/build.py).\n"
		f"Tried:\n{tried}\n"
		"The data side lives on the feat/database branch of TrainDiagramMaker_data. If your checkout is on another branch, "
		"run `git checkout feat/database` there (or `git worktree add ../RTD_data_database feat/database`), or pass --data <folder> / set RTD_DATA."
	)


def check_site():
	if not (SITE_ROOT / "zh" / "database" / "index.html").is_file():
		branch = subprocess.run(["git", "branch", "--show-current"], cwd=SITE_ROOT, capture_output=True, text=True).stdout.strip()
		raise Problem(
			f"zh/database/index.html does not exist in {SITE_ROOT} (branch: {branch or 'unknown'}), so /zh/database/ would be a 404.\n"
			"The database pages are on the feat/database branch: `git checkout feat/database`."
		)


def build_data(data_repo):
	result = subprocess.run([sys.executable, str(data_repo / "tools" / "build.py")], cwd=data_repo, capture_output=True, text=True, encoding="utf-8")
	if result.returncode != 0:
		raise Problem(f"tools/build.py failed in {data_repo}:\n{result.stdout}{result.stderr}")
	if not (data_repo / "dist" / "catalog.json").is_file():
		raise Problem(f"build.py ran but {data_repo / 'dist' / 'catalog.json'} was not written.")
	return result.stdout.strip()


class Quiet(http.server.SimpleHTTPRequestHandler):
	def log_message(self, *args):
		pass

	# only failures are shown
	def log_request(self, code="-", size="-"):
		if int(code) >= 400:
			print(f"  {code} {self.command} {self.path}  <- {self.server_name_label}", flush=True)

	def end_headers(self):
		self.send_header("Cache-Control", "no-store")
		super().end_headers()


class SiteHandler(Quiet):
	server_name_label = f"site :{SITE_PORT}"


class DataHandler(Quiet):
	server_name_label = f"data :{DATA_PORT}"

	def end_headers(self):
		self.send_header("Access-Control-Allow-Origin", "*")
		super().end_headers()


# answers both ::1 and 127.0.0.1: Windows tries ::1 first for "localhost" and waits 2 s before falling back
class DualStackServer(http.server.ThreadingHTTPServer):
	address_family = socket.AF_INET6
	# on Windows SO_REUSEADDR lets a second server bind a port that is in use, and requests then go to either one: an old
	# server from another folder or branch answers some of them with 404
	allow_reuse_address = False

	def server_bind(self):
		self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
		super().server_bind()


def start_server(port, directory, handler):
	try:
		server = DualStackServer(("::", port), partial(handler, directory=str(directory)))
	except OSError:
		return None
	threading.Thread(target=server.serve_forever, daemon=True).start()
	return server


def fetch(url, timeout=10):
	try:
		with urllib.request.urlopen(url, timeout=timeout) as res:
			return res.status, res.headers, res.read()
	except urllib.error.HTTPError as e:
		return e.code, e.headers, b""
	except OSError as e:
		return 0, {}, str(e).encode()


def start_servers(data_repo):
	"""Starts both servers, or accepts ones already running that serve the right thing. Returns the servers started here."""
	dist = data_repo / "dist"
	started = []
	for port, directory, handler, probe in [
		(SITE_PORT, SITE_ROOT, SiteHandler, f"{SITE_URL}/zh/database/index.html"),
		(DATA_PORT, dist, DataHandler, f"{DATA_URL}/catalog.json"),
	]:
		server = start_server(port, directory, handler)
		if server:
			started.append(server)
			continue
		status = fetch(probe)[0]
		if status != 200:
			raise Problem(
				f"Port {port} is taken by another program that answers {probe} with {status or 'no response'}.\n"
				f"Stop it (PowerShell: `Get-NetTCPConnection -LocalPort {port} | Select OwningProcess`, then `Stop-Process -Id <id>`) and run again. "
				"That is probably the cause of a 404: an old server from another folder or branch."
			)
		print(f"  port {port}: reusing the server already running there (it answers {probe})")
	return started


def preflight(data_repo):
	"""Every URL the pages need. Returns (ok, lines)."""
	catalog = json.loads((data_repo / "dist" / "catalog.json").read_text(encoding="utf-8"))
	urls = [f"{SITE_URL}/zh/database/", f"{SITE_URL}/zh/database/line.html", f"{SITE_URL}/zh/diagram-maker.html", f"{DATA_URL}/catalog.json"]
	first = catalog["countries"][0]["id"]
	urls.append(f"{DATA_URL}/{first}/catalog.json")
	lines = json.loads((data_repo / "dist" / first / "catalog.json").read_text(encoding="utf-8"))["lines"]
	urls.append(f"{DATA_URL}/{first}/{lines[0]['id']}/info.json")
	ok = True
	report = []
	for url in urls:
		status = fetch(url)[0]
		ok &= status == 200
		report.append(f"  {'ok ' if status == 200 else 'FAIL'} {status or 'no response'} {url}")
	return ok, report


def main():
	sys.stdout.reconfigure(line_buffering=True, encoding="utf-8")
	parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
	parser.add_argument("--data", help="data repo folder (default: look for RTD_data_database / RTD_data next to this repo)")
	parser.add_argument("--no-build", action="store_true")
	parser.add_argument("--open", action="store_true")
	args = parser.parse_args()
	try:
		check_site()
		data_repo = find_data_repo(args.data)
		print(f"site: {SITE_ROOT}\ndata: {data_repo}")
		if not args.no_build:
			print("build:", build_data(data_repo))
		start_servers(data_repo)
		ok, report = preflight(data_repo)
	except Problem as e:
		print(f"\nPROBLEM: {e}")
		sys.exit(1)
	print("\n".join(report))
	if not ok:
		print("\nPROBLEM: some URLs do not answer 200 (see above; failing requests are also logged below).")
	print(f"\nsearch page: {SITE_URL}/zh/database/\neditor:      {SITE_URL}/zh/diagram-maker.html\nCtrl+C to stop. Re-run after changing the data (it rebuilds on start).\n")
	if args.open:
		webbrowser.open(f"{SITE_URL}/zh/database/")
	try:
		threading.Event().wait()
	except KeyboardInterrupt:
		pass


if __name__ == "__main__":
	main()
