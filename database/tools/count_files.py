"""
Files that would be pushed and deployed (git-tracked or not ignored, so workspace/ is left out), against the limits:
GitHub refuses files over 100 MB; Cloudflare Pages allows 20,000 files per deployment and 25 MiB per file.

    python database/tools/count_files.py
    python database/tools/count_files.py --limit-mb 50     also list files over 50 MB
"""
import argparse
import subprocess
import sys

from common import DB

REPO = DB.parent
MB = 1000 * 1000
GITHUB_MAX = 100 * MB
PAGES_MAX = 25 * 1024 * 1024
PAGES_FILES = 20000


def main():
	sys.stdout.reconfigure(encoding="utf-8")
	parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
	parser.add_argument("--limit-mb", type=float, help="also list files larger than this")
	args = parser.parse_args()

	out = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=REPO, capture_output=True, check=True).stdout
	files = [REPO / name for name in out.decode("utf-8").split("\0") if name and (REPO / name).is_file()]
	sizes = {f.relative_to(REPO).as_posix(): f.stat().st_size for f in files}
	in_db = [f for f in sizes if f.startswith("database/")]

	print(f"site:     {len(sizes):>6} files, {sum(sizes.values()) / MB:,.1f} MB  (Cloudflare Pages: at most {PAGES_FILES:,})")
	print(f"database: {len(in_db):>6} files, {sum(sizes[f] for f in in_db) / MB:,.1f} MB")
	if len(sizes) > PAGES_FILES:
		print(f"OVER: {len(sizes) - PAGES_FILES} files more than Cloudflare Pages allows")
	limits = [(GITHUB_MAX, "over 100 MB (GitHub refuses)"), (PAGES_MAX, "over 25 MiB (Cloudflare Pages refuses)")]
	if args.limit_mb:
		limits.append((args.limit_mb * MB, f"over {args.limit_mb:g} MB"))
	for limit, label in limits:
		big = sorted((f for f in sizes if sizes[f] > limit), key=lambda f: -sizes[f])
		print(f"{label}: {len(big)}")
		for f in big:
			print(f"  {sizes[f] / MB:>8.1f} MB  {f}")


if __name__ == "__main__":
	main()
