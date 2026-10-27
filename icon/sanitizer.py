#!/usr/bin/env python3
"""Sanitize SVG files, remove editor fingerprints, and normalize classes/layers."""

import argparse
import re
from pathlib import Path

from lxml import etree


SVG_NS = "http://www.w3.org/2000/svg"
XHTML_NS = "http://www.w3.org/1999/xhtml"
XML_NS = "http://www.w3.org/XML/1998/namespace"

# Elements outside these namespaces (RDF, Inkscape, Adobe, ...) are dropped.
KEEP_NAMESPACES = {SVG_NS, XHTML_NS, None}

# Vendor-prefixed (-inkscape-*) and Illustrator-only style properties.
EDITOR_STYLE_PREFIXES = ("-", "enable-background")

EDITOR_NAMESPACES = (
    "http://www.inkscape.org/namespaces/inkscape",
    "http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd",
    "http://ns.adobe.com/AdobeIllustrator",
    "http://ns.adobe.com/AdobeSVGViewer",
    "http://www.bohemiancoding.com/sketch/ns",
    "http://www.figma.com",
)

# Namespace URIs and attribute names associated with design applications.
EDITOR_PREFIXES = (
    "inkscape", "sodipodi", "illustrator", "adobe",
    "sketch", "figma",
)

TIME_NAMES = {
    "created": {
        "created", "datecreated", "creationdate",
        "createdate", "date-created",
    },
    "edited": {
        "modified", "datemodified", "modificationdate",
        "updated", "lastmodified", "date-edited", "date",
    },
}


def local_name(name):
    """Return an XML name without its namespace."""
    return etree.QName(name).localname if name.startswith("{") else name


def namespace_uri(name):
    """Return an XML attribute's namespace URI, if present."""
    return etree.QName(name).namespace if name.startswith("{") else None


def normalize_key(name):
    return re.sub(r"[^a-z]", "", local_name(name).lower())


def rename_class(token, class_map):
    if token not in class_map:
        class_map[token] = f"class-{len(class_map) + 1}"
    return class_map[token]


def extract_timestamps(root):
    """Best-effort extraction of creation and modification timestamps."""
    result = {}

    for element in root.iter():
        for attr, value in element.attrib.items():
            key = normalize_key(attr)
            value = value.strip()
            if not value:
                continue

            for kind, candidates in TIME_NAMES.items():
                if key in candidates and kind not in result:
                    result[kind] = value

        if element.text and element.text.strip():
            key = normalize_key(element.tag)
            value = element.text.strip()

            for kind, candidates in TIME_NAMES.items():
                if key in candidates and kind not in result:
                    result[kind] = value

    return result


def is_editor_attribute(name):
    uri = namespace_uri(name)
    local = local_name(name).lower()

    if uri and any(uri.startswith(ns) for ns in EDITOR_NAMESPACES):
        return True

    if ":" in name:
        prefix = name.split(":", 1)[0].lower()
        if any(prefix.startswith(p) for p in EDITOR_PREFIXES):
            return True

    # Application-specific attributes in otherwise unqualified XML.
    if local.startswith("data-"):
        return True

    return False


def sanitize_tree(root):
    timestamps = extract_timestamps(root)

    # Remove comments and processing instructions.
    for node in root.xpath("//comment() | //processing-instruction()"):
        parent = node.getparent()
        if parent is not None:
            parent.remove(node)

    # Remove metadata, titles, and every element from an editor namespace.
    for element in list(root.iter()):
        if element is root:
            continue

        name = local_name(element.tag)
        uri = namespace_uri(element.tag)

        if uri not in KEEP_NAMESPACES or (
            uri == SVG_NS and name in {"metadata", "title", "desc"}
        ):
            parent = element.getparent()
            if parent is not None:
                parent.remove(element)

    # Layers: Inkscape layer groups and top-level groups (Illustrator).
    # Identified before the groupmode attribute is stripped.
    layer_elements = []
    for element in root.iter(f"{{{SVG_NS}}}g"):
        is_layer = element.getparent() is root or any(
            local_name(attr).lower() == "groupmode"
            and value.lower() == "layer"
            for attr, value in element.attrib.items()
        )
        if is_layer and element.get("id"):
            layer_elements.append(element)

    # Strip data-*, editor attributes, and vendor-only style properties.
    for element in root.iter():
        for attr in list(element.attrib):
            if local_name(attr) == "enable-background" or is_editor_attribute(attr):
                del element.attrib[attr]

        style = element.get("style")
        if style:
            kept = [
                declaration for declaration in style.split(";")
                if declaration.strip()
                and not declaration.strip().startswith(EDITOR_STYLE_PREFIXES)
            ]
            if kept:
                element.set("style", ";".join(kept))
            else:
                del element.attrib["style"]

    # Normalize classes consistently across the whole document.
    class_map = {}

    for element in root.iter():
        classes = element.get("class")
        if not classes:
            continue

        renamed = [rename_class(token, class_map) for token in classes.split()]
        element.set("class", " ".join(renamed))

    # Rename class selectors in <style> blocks to match.
    for element in root.iter(f"{{{SVG_NS}}}style"):
        if element.text:
            element.text = re.sub(
                r"(?<![\w.#-])\.(-?[A-Za-z_][\w-]*)",
                lambda m: "." + rename_class(m.group(1), class_map),
                element.text,
            )

    # Map every old ID to a new one: layers as layer-N, the rest as item-N.
    id_map = {}
    counts = {"layer": 0, "item": 0}
    for element in root.iter():
        old_id = element.get("id")
        if old_id is None or old_id in id_map:
            continue
        kind = "layer" if element in layer_elements else "item"
        counts[kind] += 1
        id_map[old_id] = f"{kind}-{counts[kind]}"

    url_pattern = re.compile(r"url\(\s*(['\"]?)#([^)'\"\s]+)\1\s*\)")

    def new_id(name):
        return id_map.get(name, name)

    def remap_reference(attr, value):
        local = local_name(attr)

        if local == "href" and value.startswith("#"):
            return "#" + new_id(value[1:])

        # Animation timing such as "rect1.click".
        if local in {"begin", "end"}:
            return re.sub(
                r"(?<![\w.-])([A-Za-z_][\w-]*)(?=\.)",
                lambda m: new_id(m.group(1)),
                value,
            )

        # Space-separated references such as aria-labelledby.
        if local.startswith("aria-"):
            return " ".join(new_id(token) for token in value.split())

        return url_pattern.sub(lambda m: f"url(#{new_id(m.group(2))})", value)

    # Update references while IDs still hold their old values.
    for element in root.iter():
        for attr, value in list(element.attrib.items()):
            element.set(attr, remap_reference(attr, value))

        if element.tag == f"{{{SVG_NS}}}style" and element.text:
            element.text = re.sub(
                r"(?<![\w&])#([A-Za-z_][\w-]*)",
                lambda m: "#" + new_id(m.group(1)),
                element.text,
            )

    for element in root.iter():
        old_id = element.get("id")
        if old_id is not None:
            element.set("id", id_map[old_id])

    # Re-add only the available timestamps.
    if timestamps:
        metadata = etree.Element(f"{{{SVG_NS}}}metadata")
        times = etree.SubElement(metadata, "timestamps")

        for kind in ("created", "edited"):
            if kind in timestamps:
                times.set(kind, timestamps[kind])

        root.insert(0, metadata)

    return root


def sanitize_svg(source, destination):
    parser = etree.XMLParser(
        remove_comments=True,
        remove_pis=True,
        resolve_entities=False,
        no_network=True,
        recover=False,
        huge_tree=False,
    )

    tree = etree.parse(str(source), parser)
    root = sanitize_tree(tree.getroot())

    # Remove unused namespace declarations where possible.
    # Preserve namespaces still needed by the SVG artwork.
    etree.cleanup_namespaces(root)

    output = etree.tostring(
        root,
        encoding="UTF-8",
        xml_declaration=True,
        pretty_print=True,
    )

    Path(destination).write_bytes(output)


def main():
    parser = argparse.ArgumentParser(
        description="Strip SVG metadata and normalize classes and layers."
    )
    parser.add_argument("input", help="Input SVG file or directory")
    parser.add_argument(
        "-o", "--output",
        help="Output SVG file or directory",
    )
    args = parser.parse_args()

    source = Path(args.input)

    if not source.exists():
        parser.error(f"Input does not exist: {source}")

    if source.is_file():
        if source.suffix.lower() != ".svg":
            parser.error("Input file must have an .svg extension")

        destination = Path(args.output) if args.output else (
            source.with_name(source.stem + ".clean.svg")
        )
        sanitize_svg(source, destination)
        print(f"Sanitized: {destination}")
        return

    files = sorted(source.glob("*.svg"))
    if not files:
        parser.error("No SVG files found in the input directory")

    output_dir = Path(args.output) if args.output else source / "sanitized"
    output_dir.mkdir(parents=True, exist_ok=True)

    for file in files:
        destination = output_dir / file.name
        sanitize_svg(file, destination)
        print(f"Sanitized: {destination}")


if __name__ == "__main__":
    main()