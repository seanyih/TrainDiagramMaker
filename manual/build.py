"""
Build manual pages: src/{slug}.md -> {slug}.html
Page titles, order and sidenav come from pages.json.
Requires: pip install markdown
Usage: python build.py
"""
import json
import re
from html import escape
from pathlib import Path

import markdown
from markdown.extensions.toc import slugify_unicode

ROOT = Path(__file__).parent

config = json.loads((ROOT / "pages.json").read_text(encoding="utf-8"))
template = (ROOT / "template.html").read_text(encoding="utf-8")

# flat list of (chapter title, page) in sidenav order
pages = [(chapter["title"], page) for chapter in config["chapters"] for page in chapter["pages"]]


def render_sidenav(current):
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


def render_toc(tokens):
	if not tokens:
		return ""
	def items(tokens):
		out = ["<ul>"]
		for t in tokens:
			out.append(f'<li><a href="#{t["id"]}">{t["name"]}</a>{items(t["children"]) if t["children"] else ""}</li>')
		out.append("</ul>")
		return "".join(out)
	return f'\t\t\t<p class="manual-toc-title">本頁內容</p>\n\t\t\t{items(tokens)}'


def render_pager(index):
	out = []
	for i, cls, label in ((index - 1, "prev", "上一頁"), (index + 1, "next", "下一頁")):
		if 0 <= i < len(pages):
			page = pages[i][1]
			out.append(f'\t\t\t\t<a class="{cls}" href="{page["slug"]}.html"><small>{label}</small>{escape(page["title"])}</a>')
		else:
			out.append("\t\t\t\t<span></span>")
	return "\n".join(out)


# <p><img alt src></p> -> <figure> with caption, or a placeholder if the file does not exist yet
def render_images(html, slug):
	def figure(m):
		src, alt = m.group("src"), m.group("alt")
		if not src.startswith("http") and not (ROOT / src).exists():
			print(f"  [missing image] {slug}: {src} ({alt})")
			return f'<figure><div class="img-missing">待補截圖：{alt}<br><code>{src}</code></div></figure>'
		caption = f"<figcaption>{alt}</figcaption>" if alt else ""
		return f'<figure><img src="{src}" alt="{alt}">{caption}</figure>'
	return re.sub(r'<p><img alt="(?P<alt>[^"]*)" src="(?P<src>[^"]*)" ?/?></p>', figure, html)


for index, (chapter, page) in enumerate(pages):
	slug = page["slug"]
	md = markdown.Markdown(
		extensions=["tables", "fenced_code", "admonition", "toc"],
		extension_configs={"toc": {"slugify": slugify_unicode, "toc_depth": "2-3"}},
	)
	content = md.convert((ROOT / "src" / f"{slug}.md").read_text(encoding="utf-8"))
	content = render_images(content, slug)

	html = (template
		.replace("{{site_title}}", escape(config["title"]))
		.replace("{{title}}", escape(page["title"]))
		.replace("{{chapter}}", escape(chapter))
		.replace("{{slug}}", slug)
		.replace("{{sidenav}}", render_sidenav(slug))
		.replace("{{toc}}", render_toc(md.toc_tokens))
		.replace("{{pager}}", render_pager(index))
		.replace("{{content}}", content))
	(ROOT / f"{slug}.html").write_text(html, encoding="utf-8")
	print(f"{slug}.html")
