"""HTML document assembly for normalized PRD manifests."""

from __future__ import annotations

import hashlib
from pathlib import Path

from ..manifest_types import NormalizedManifest
from ..paths import ASSET_DIR, TEMPLATE_PATH
from ..spec import BLOCK_SPECS, TEMPLATE_MARKER_PATTERN
from .blocks import render_block_content
from .helpers import category_label, category_level, escape_html
from .traceability import (
    CoverageReport,
    board_state,
    coverage_report,
    render_traceability_content,
)

TRACEABILITY_CATEGORY = "delivery-assurance"


def asset_version() -> str:
    digest = hashlib.sha256()
    for asset_path in sorted(ASSET_DIR.rglob("*")):
        if not asset_path.is_file():
            continue
        digest.update(asset_path.relative_to(ASSET_DIR).as_posix().encode("utf-8"))
        digest.update(asset_path.read_bytes())
    return digest.hexdigest()[:12]


def status_state(status: str) -> str:
    normalized = status.strip().lower()
    if "accept" in normalized:
        return "accepted"
    if "reject" in normalized or "block" in normalized:
        return "held"
    return "draft"


def render_navigation(entries: list[tuple[str, str, str, int]]) -> str:
    groups: list[tuple[int, str, list[str]]] = []
    for anchor, title, category, number in entries:
        label = category_label(category)
        level = category_level(category)
        item = (
            f'<li><a href="#{anchor}">'
            f'<span class="cue-number">{number:02d}</span>'
            f'<span class="cue-name">{escape_html(title)}</span>'
            '<span class="cue-lamp" aria-hidden="true"></span></a></li>'
        )
        if groups and groups[-1][1] == label:
            groups[-1][2].append(item)
            continue
        groups.append((level, label, [item]))
    # The group label doubles as the ladder legend: the level number and its
    # swatch key the band colour a reader is currently inside to a category.
    return "".join(
        f'<div class="cue-group" data-level="{level}">'
        '<p class="cue-group-label">'
        f'<span class="cue-group-level">{level:02d}</span>'
        f"<span>{escape_html(label)}</span>"
        '<span class="cue-group-swatch" aria-hidden="true"></span></p>'
        f'<ol>{"".join(items)}</ol></div>'
        for level, label, items in groups
    )


def render_board(report: CoverageReport, headline: str, reading: str) -> str:
    return (
        f'<div class="board" data-board="{"clear" if not report["held"] else "held"}">'
        '<p class="board-title">'
        '<span class="lamp" aria-hidden="true"></span>'
        f"<strong>{escape_html(headline)}</strong></p>"
        f'<p class="board-reading">{escape_html(reading)}</p>'
        '<dl class="board-counts">'
        f'<div><dt>Up</dt><dd>{report["up"]}</dd></div>'
        f'<div><dt>Held</dt><dd>{report["held"]}</dd></div>'
        f'<div><dt>Coverage</dt><dd>{report["percent"]}<span>%</span></dd></div>'
        "</dl></div>"
    )


def render_document(
    manifest: NormalizedManifest,
    output_path: Path | str | None = None,
) -> str:
    rendered_output_path = (
        Path(output_path).as_posix()
        if output_path is not None
        else f"action-items/PRD-{manifest['slug']}"
    ).rstrip("/") + "/"
    metadata_items: dict[str, str] = {
        "Initiative": manifest["initiative_type"],
        "Review surfaces": ", ".join(manifest["review_surfaces"]),
    }
    metadata_items.update(manifest["metadata"])
    metadata_items["Output"] = rendered_output_path
    metadata = "".join(
        f"<div><dt>{escape_html(label)}</dt><dd>{escape_html(value)}</dd></div>"
        for label, value in metadata_items.items()
    )

    report = coverage_report(manifest["blocks"])
    aspects = report["aspects"]

    navigation_entries: list[tuple[str, str, str, int]] = []
    rendered_blocks: list[str] = []
    for number, (name, value) in enumerate(manifest["blocks"].items(), start=1):
        spec = BLOCK_SPECS[name]
        heading_id = f"{name}-heading"
        content = render_block_content(name, value, spec, aspects)
        if name == "repository_grounding":
            content = (
                '<p class="evidence-disclaimer"><strong>Evidence only:</strong> referenced '
                "paths and symbols support product statements; they are not mandatory "
                f"implementation instructions.</p>{content}"
            )
        navigation_entries.append((name, spec.title, spec.category, number))
        rendered_blocks.append(
            f'<section id="{name}" class="cue" data-block="{name}" '
            f'data-block-category="{spec.category}" data-review-area="{spec.review_area}" '
            f'data-level="{category_level(spec.category)}" '
            f'aria-labelledby="{heading_id}">'
            '<div class="cue-band" aria-hidden="true"></div>'
            '<div class="cue-head">'
            f'<p class="cue-meta"><span class="cue-number">{number:02d}</span></p>'
            f'<h2 id="{heading_id}"><a href="#{name}">{escape_html(spec.title)}</a></h2>'
            f'<p class="cue-note">{escape_html(spec.description)}</p></div>'
            f'<div class="cue-content">{content}</div></section>'
        )

    headline, reading = board_state(report)
    if report["tracked"]:
        number = len(rendered_blocks) + 1
        navigation_entries.append(
            ("traceability", "Traceability and coverage", TRACEABILITY_CATEGORY, number)
        )
        rendered_blocks.append(
            '<section id="traceability" class="cue cue--close" data-block="traceability" '
            f'data-block-category="{TRACEABILITY_CATEGORY}" '
            'data-review-area="validation decisions" '
            f'data-level="{category_level(TRACEABILITY_CATEGORY)}" '
            'aria-labelledby="traceability-heading">'
            '<div class="cue-band" aria-hidden="true"></div>'
            '<div class="cue-head">'
            f'<p class="cue-meta"><span class="cue-number">{number:02d}</span></p>'
            '<h2 id="traceability-heading">'
            '<a href="#traceability">Traceability and coverage</a></h2>'
            '<p class="cue-note">Whether every claim on this page connects to the '
            "product intent it supports.</p></div>"
            f'<div class="cue-content">{render_traceability_content(report)}</div></section>'
        )

    has_supporting_details = any(
        BLOCK_SPECS[name].kind in {"diagram", "tree"} for name in manifest["blocks"]
    )
    replacements = {
        "{{TITLE}}": escape_html(manifest["title"]),
        "{{SUMMARY}}": escape_html(manifest["summary"]),
        "{{STATUS}}": escape_html(manifest["status"]),
        "{{STATUS_STATE}}": status_state(manifest["status"]),
        "{{ASSET_VERSION}}": asset_version(),
        "{{CUE_COUNT}}": f"{len(rendered_blocks):02d}",
        "{{BOARD}}": render_board(report, headline, reading),
        "{{METADATA}}": metadata,
        "{{NAVIGATION}}": render_navigation(navigation_entries),
        "{{DETAILS_CONTROL}}": (
            '<button id="collapse-all" type="button" aria-pressed="false">Collapse notes</button>'
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
