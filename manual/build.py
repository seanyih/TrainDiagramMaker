"""
Build manual pages of every language: {lang}/manual/src/{slug}.md -> {lang}/manual/{slug}.html.
Page titles, order, sidenav and labels come from {lang}/manual/pages.json, the page from {lang}/manual/template.html.
Requires: pip install markdown
Usage: python manual/build.py [lang ...]    (default: all languages)
"""
import json
import re
import sys
from html import escape, unescape
from pathlib import Path

import markdown
from markdown.extensions.toc import slugify_unicode

ROOT = Path(__file__).parent.parent

# folders having a manual, the first is the default language
LANGS = sorted((p.parent.parent.name for p in ROOT.glob("*/manual/pages.json")), key=lambda d: (d != "zh", d))
configs = {lang: json.loads((ROOT / lang / "manual" / "pages.json").read_text(encoding="utf-8")) for lang in LANGS}


def page_list(config):
	# flat list of (chapter title, page) in sidenav order
	return [(chapter["title"], page) for chapter in config["chapters"] for page in chapter["pages"]]


def render_sidenav(config, current):
	out = []
	for chapter in config["chapters"]:
		if chapter["title"]:
			out.append(f'\t\t\t<p class="manual-sidenav-chapter">{escape(chapter["title"])}</p>')
		out.append("\t\t\t<ul>")
		for page in chapter["pages"]:
			active = ' class="active"' if page["slug"] == current else ""
			badge = f'<span class="manual-badge">{escape(page["badge"])}</span>' if "badge" in page else ""
			out.append(f'\t\t\t\t<li><a href="{page["slug"]}.html"{active}>{escape(page["title"])}{badge}</a></li>')
		out.append("\t\t\t</ul>")
	return "\n".join(out)


def render_toc(labels, tokens):
	if not tokens:
		return ""
	def items(tokens):
		out = ["<ul>"]
		for t in tokens:
			out.append(f'<li><a href="#{t["id"]}">{t["name"]}</a>{items(t["children"]) if t["children"] else ""}</li>')
		out.append("</ul>")
		return "".join(out)
	return f'\t\t\t<p class="manual-toc-title">{escape(labels["toc"])}</p>\n\t\t\t{items(tokens)}'


def render_pager(labels, pages, index):
	out = []
	for i, cls in ((index - 1, "prev"), (index + 1, "next")):
		if 0 <= i < len(pages):
			page = pages[i][1]
			out.append(f'\t\t\t\t<a class="{cls}" href="{page["slug"]}.html"><small>{escape(labels[cls])}</small>{escape(page["title"])}</a>')
		else:
			out.append("\t\t\t\t<span></span>")
	return "\n".join(out)


# <p><img alt src></p> -> <figure> with caption, or a placeholder if the file does not exist yet
def render_images(labels, folder, html, slug):
	def figure(m):
		src, alt = m.group("src"), m.group("alt")
		if not src.startswith("http") and not (folder / src).exists():
			print(f"  [missing image] {slug}: {src} ({alt})")
			return f'<figure><div class="img-missing">{escape(labels["missing_image"])}：{alt}<br><code>{src}</code></div></figure>'
		caption = f"<figcaption>{alt}</figcaption>" if alt else ""
		return f'<figure><img src="{src}" alt="{alt}">{caption}</figure>'
	return re.sub(r'<p><img alt="(?P<alt>[^"]*)" src="(?P<src>[^"]*)" ?/?></p>', figure, html)


# the first paragraph as plain text
def describe(html):
	m = re.search(r"<p>(.*?)</p>", html, re.S)
	text = re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", "", m.group(1)))).strip() if m else ""
	return text if len(text) <= 120 else text[:119] + "…"


def build(lang):
	folder = ROOT / lang / "manual"
	config = configs[lang]
	labels = config["labels"]
	template = (folder / "template.html").read_text(encoding="utf-8")
	pages = page_list(config)
	for index, (chapter, page) in enumerate(pages):
		slug = page["slug"]
		md = markdown.Markdown(
			extensions=["tables", "fenced_code", "admonition", "toc"],
			extension_configs={"toc": {"slugify": slugify_unicode, "toc_depth": "2-3"}},
		)
		content = md.convert((folder / "src" / f"{slug}.md").read_text(encoding="utf-8"))
		content = render_images(labels, folder, content, slug)

		html = (template
			.replace("{{site_title}}", escape(config["title"]))
			.replace("{{title}}", escape(page["title"]))
			.replace("{{description}}", escape(describe(content)))
			.replace("{{chapter}}", escape(chapter))
			.replace("{{slug}}", slug)
			.replace("{{sidenav}}", render_sidenav(config, slug))
			.replace("{{toc}}", render_toc(labels, md.toc_tokens))
			.replace("{{pager}}", render_pager(labels, pages, index))
			.replace("{{content}}", content))
		(folder / f"{slug}.html").write_text(html, encoding="utf-8")
		print(f"{lang}/manual/{slug}.html")


for lang in sys.argv[1:] or LANGS:
	build(lang)
