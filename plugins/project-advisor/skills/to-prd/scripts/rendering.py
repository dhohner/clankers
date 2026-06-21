"""HTML document assembly for normalized PRD manifests."""

from __future__ import annotations

import html
from pathlib import Path

from .paths import TEMPLATE_PATH
from .render_blocks import render_block_content
from .render_helpers import escape_html
from .render_traceability import render_traceability_view
from .spec import BLOCK_SPECS, TEMPLATE_MARKER_PATTERN
from .types import NormalizedManifest


def render_document(
    manifest: NormalizedManifest,
    output_path: Path | str | None = None,
) -> str:
    rendered_output_path = (
        Path(output_path).as_posix()
        if output_path is not None
        else f"action-items/PRD-{manifest['slug']}"
    ).rstrip("/") + "/"
    metadata_items: dict[str, str] = {}
    for label, value in manifest["metadata"].items():
        if label.casefold() == "review mode":
            metadata_items["Output"] = rendered_output_path
        metadata_items[label] = value
    if "Output" not in metadata_items:
        metadata_items["Output"] = rendered_output_path
    metadata = "".join(
        f"<div><dt>{escape_html(label)}</dt><dd>{escape_html(value)}</dd></div>"
        for label, value in metadata_items.items()
    )

    navigation = ['<a href="#summary">Summary</a>']
    rendered_blocks: list[str] = []
    for number, (name, value) in enumerate(manifest["blocks"].items(), start=1):
        spec = BLOCK_SPECS[name]
        heading_id = f"{name}-heading"
        content = render_block_content(name, value, spec)
        if name == "repository_grounding":
            content = (
                '<p class="evidence-disclaimer"><strong>Evidence only:</strong> referenced paths and symbols support product statements; they are not mandatory implementation instructions.</p>'
                f"{content}"
            )
        if name == "scope":
            content = (
                '<details class="supporting-detail" open>'
                f"<summary>Review {html.escape(spec.title.lower())}</summary>"
                f"{content}</details>"
            )
        navigation.append(f'<a href="#{name}">{escape_html(spec.title)}</a>')
        rendered_blocks.append(
            f'<section id="{name}" class="section" data-block="{name}" '
            f'data-block-category="{spec.category}" data-review-area="{spec.review_area}" '
            f'aria-labelledby="{heading_id}">'
            '<div class="section-heading">'
            f'<span>{number:02d}</span><div><h2 id="{heading_id}">'
            f'<a href="#{name}">{escape_html(spec.title)}</a></h2>'
            f"<p>{escape_html(spec.description)}</p></div></div>"
            f"{content}</section>"
        )

    traceability_view = render_traceability_view(manifest["blocks"])
    if traceability_view:
        navigation.append('<a href="#traceability">Traceability</a>')
        rendered_blocks.append(traceability_view)

    has_supporting_details = any(
        name == "scope" or BLOCK_SPECS[name].kind == "diagram"
        for name in manifest["blocks"]
    )
    replacements = {
        "{{TITLE}}": escape_html(manifest["title"]),
        "{{SUMMARY}}": escape_html(manifest["summary"]),
        "{{STATUS}}": escape_html(manifest["status"]),
        "{{METADATA}}": metadata,
        "{{NAVIGATION}}": "\n".join(navigation),
        "{{DETAILS_CONTROL}}": (
            '<button id="collapse-all" type="button" aria-pressed="false">Collapse details</button>'
            if has_supporting_details
            else ""
        ),
        "{{BLOCKS}}": "\n".join(rendered_blocks),
    }
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    template_markers = set(TEMPLATE_MARKER_PATTERN.findall(template))
    unknown_markers = sorted(template_markers - replacements.keys())
    if unknown_markers:
        raise RuntimeError(f"template contains unresolved markers: {', '.join(unknown_markers)}")
    missing_markers = sorted(replacements.keys() - template_markers)
    if missing_markers:
        raise RuntimeError(f"template is missing expected markers: {', '.join(missing_markers)}")
    return TEMPLATE_MARKER_PATTERN.sub(lambda match: replacements[match.group(0)], template)


__all__ = ["render_document"]
