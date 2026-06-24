"""Rendering helpers for visual PRD review blocks."""

from __future__ import annotations

import math
from typing import Any

from ..spec import BlockSpec
from .helpers import escape_html, field_label


def render_visual_heading(kind: str, description: str, description_id: str) -> str:
    return (
        '<div class="visual-heading">'
        f'<span class="review-aid-label">{escape_html(kind)} · Review aid</span>'
        "<span>Behavioral intent, not final production design</span>"
        "</div>"
        f'<p id="{description_id}" class="visual-description">{escape_html(description)}</p>'
    )


def render_frames(name: str, items: list[dict[str, Any]], spec: BlockSpec) -> str:
    frames: list[str] = []
    primary, secondary = spec.fields
    visual_kind = "Annotated state" if name == "annotated_screens" else "Wireframe"
    for index, item in enumerate(items, start=1):
        regions = item["regions"] or [
            {
                "label": field_label(secondary),
                "detail": item[secondary],
            }
        ]
        rendered_regions = "".join(
            '<div class="screen-region">'
            f"<strong>{escape_html(region['label'])}</strong>"
            f"<span>{escape_html(region['detail'])}</span></div>"
            for region in regions
        )
        description_id = f"{name}-visual-{index}-description"
        frames.append(
            f'<figure class="visual-surface screen-surface" aria-labelledby="{description_id}">'
            f"{render_visual_heading(visual_kind, item[secondary], description_id)}"
            '<div class="screen-chrome">'
            '<div class="screen-toolbar" aria-hidden="true"><i></i><i></i><i></i></div>'
            f'<div class="screen-canvas"><span class="screen-title">'
            f"{escape_html(item[primary])}</span>{rendered_regions}</div></div>"
            f"<figcaption>{escape_html(item[primary])}</figcaption></figure>"
        )
    return '<div class="visual-grid">' + "".join(frames) + "</div>"


def render_native_diagram(name: str, description: str, native: dict[str, Any]) -> str:
    nodes = native["nodes"]
    node_width = 180
    node_height = 70
    max_edge_label = max((len(edge["label"]) for edge in native["edges"]), default=0)
    column_gap = max(58, min(420, max_edge_label * 7 + 32))
    row_gap = max(55, min(160, max_edge_label * 4 + 24))
    columns = min(3, len(nodes)) or 1
    rows = math.ceil(len(nodes) / columns)
    width = max(760, columns * node_width + max(0, columns - 1) * column_gap + 40)
    height = rows * node_height + max(0, rows - 1) * row_gap + 52
    positions: dict[str, tuple[int, int]] = {}
    total_width = columns * node_width + max(0, columns - 1) * column_gap
    start_x = max(20, (width - total_width) // 2)
    node_markup: list[str] = []
    for index, node in enumerate(nodes):
        row = index // columns
        row_column = index % columns
        column = row_column if row % 2 == 0 else columns - row_column - 1
        x = start_x + column * (node_width + column_gap)
        y = 26 + row * (node_height + row_gap)
        positions[node["id"]] = (x, y)
        node_markup.append(
            f'<g class="native-node"><rect x="{x}" y="{y}" width="{node_width}" '
            f'height="{node_height}" rx="12"></rect>'
            f'<foreignObject x="{x + 10}" y="{y + 8}" width="{node_width - 20}" '
            f'height="{node_height - 16}"><div xmlns="http://www.w3.org/1999/xhtml" '
            f'class="native-node-label">{escape_html(node["label"])}</div>'
            "</foreignObject></g>"
        )
    edge_markup: list[str] = []
    for edge in native["edges"]:
        if edge["from"] not in positions or edge["to"] not in positions:
            continue
        from_x, from_y = positions[edge["from"]]
        to_x, to_y = positions[edge["to"]]
        from_center_x = from_x + node_width // 2
        from_center_y = from_y + node_height // 2
        to_center_x = to_x + node_width // 2
        to_center_y = to_y + node_height // 2
        delta_x = to_center_x - from_center_x
        delta_y = to_center_y - from_center_y
        label_anchor = "middle"
        if from_y == to_y:
            direction = 1 if delta_x >= 0 else -1
            x1 = from_center_x + direction * node_width // 2
            y1 = from_center_y
            x2 = to_center_x - direction * (node_width // 2 + 10)
            y2 = to_center_y
            path = f"M {x1} {y1} L {x2} {y2}"
            label_x = (x1 + x2) // 2
            label_y = y1 - 9
        elif from_x == to_x:
            direction = 1 if delta_y >= 0 else -1
            x1 = from_center_x
            y1 = from_center_y + direction * node_height // 2
            x2 = to_center_x
            y2 = to_center_y - direction * (node_height // 2 + 10)
            path = f"M {x1} {y1} L {x2} {y2}"
            label_x = x1 + 18
            label_y = (y1 + y2) // 2 - 4
            label_anchor = "start"
        else:
            direction = 1 if delta_y >= 0 else -1
            x1 = from_center_x
            y1 = from_center_y + direction * node_height // 2
            x2 = to_center_x
            y2 = to_center_y - direction * (node_height // 2 + 10)
            bend_y = (y1 + y2) // 2
            path = f"M {x1} {y1} L {x1} {bend_y} L {x2} {bend_y} L {x2} {y2}"
            label_x = (x1 + x2) // 2
            label_y = bend_y - 9
        label = (
            f'<text class="native-edge-label" x="{label_x}" y="{label_y}" text-anchor="{label_anchor}">{escape_html(edge["label"])}</text>'
            if edge["label"]
            else ""
        )
        edge_markup.append(f'<path d="{path}" marker-end="url(#{name}-arrow)"></path>{label}')
    description_id = f"{name}-visual-description"
    return (
        f'<figure class="diagram-surface native-diagram" aria-labelledby="{description_id}">'
        f'<p id="{description_id}" class="visual-description">{escape_html(description)}</p>'
        '<div class="diagram-canvas">'
        f'<svg viewBox="0 0 {width} {height}" role="img" aria-labelledby="{description_id}" preserveAspectRatio="xMidYMid meet">'
        f'<defs><marker id="{name}-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
        '<path d="M 0 0 L 10 5 L 0 10 z"></path></marker></defs>'
        f'<g class="native-edges">{"".join(edge_markup)}</g>'
        f'{"".join(node_markup)}</svg></div>'
        '<figcaption>Structured HTML and SVG generated from manifest content.</figcaption>'
        "</figure>"
    )


def render_mermaid_diagram(name: str, value: dict[str, Any]) -> str:
    description_id = f"{name}-visual-description"
    source_id = f"{name}-mermaid-source"
    return (
        f'<figure class="diagram-surface mermaid-diagram" aria-labelledby="{description_id}">'
        f'<p id="{description_id}" class="visual-description">{escape_html(value["description"])}</p>'
        f'<div class="mermaid-canvas" data-mermaid-source="{source_id}" aria-hidden="true"><p class="visual-loading">Rendering diagram…</p></div>'
        '<details class="diagram-source-details" open>'
        '<summary>Diagram source and text fallback</summary>'
        f'<pre id="{source_id}" class="diagram-source"><code>{escape_html(value["source"])}</code></pre></details>'
        '<figcaption>Rendered from Mermaid source using the approved CDN.</figcaption>'
        "</figure>"
    )


__all__ = [
    "render_frames",
    "render_mermaid_diagram",
    "render_native_diagram",
    "render_visual_heading",
]