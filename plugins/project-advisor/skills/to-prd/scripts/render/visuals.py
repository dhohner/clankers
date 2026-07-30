"""Rendering helpers for visual PRD review blocks."""

from __future__ import annotations

from typing import Any

from ..spec import BlockSpec
from .helpers import escape_html, field_label


def render_visual_heading(kind: str, description: str, description_id: str) -> str:
    return (
        '<div class="visual-heading">'
        f'<span class="review-aid-label">{escape_html(kind)}: Review aid</span>'
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
            '<div class="review-region">'
            f"<dt>{escape_html(region['label'])}</dt>"
            f"<dd>{escape_html(region['detail'])}</dd></div>"
            for region in regions
        )
        description_id = f"{name}-visual-{index}-description"
        frames.append(
            f'<figure class="visual-surface screen-surface" aria-labelledby="{description_id}">'
            f"{render_visual_heading(visual_kind, item[secondary], description_id)}"
            '<div class="review-frame">'
            f'<h3 class="review-frame-title">{escape_html(item[primary])}</h3>'
            f'<dl class="review-regions">{rendered_regions}</dl></div>'
            f"<figcaption>{escape_html(item[primary])}</figcaption></figure>"
        )
    return '<div class="visual-grid">' + "".join(frames) + "</div>"


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
        "</figure>"
    )


__all__ = [
    "render_frames",
    "render_mermaid_diagram",
    "render_visual_heading",
]
