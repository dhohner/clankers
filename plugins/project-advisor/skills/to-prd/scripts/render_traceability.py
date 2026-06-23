"""Traceability rendering for normalized PRD entities."""

from __future__ import annotations

from typing import Any

from .render_helpers import escape_html
from .spec import BLOCK_SPECS, entity_label
from .types import NormalizedBlocks


def iter_entities(blocks: NormalizedBlocks) -> list[tuple[str, str, str, dict[str, Any]]]:
    entities: list[tuple[str, str, str, dict[str, Any]]] = []
    for block_name, items in blocks.items():
        spec = BLOCK_SPECS[block_name]
        if not spec.id_prefix:
            continue
        title_field = "question" if spec.kind == "questions" else spec.fields[0]
        for item in items:
            entities.append((block_name, item["id"], item.get(title_field, ""), item))
    return entities


def render_traceability_links(references: list[str]) -> str:
    if not references:
        return "—"
    return ", ".join(
        f'<a href="#{escape_html(reference)}">{escape_html(entity_label(reference))}</a>'
        for reference in references
    )


def render_traceability_view(blocks: NormalizedBlocks) -> str:
    entities = iter_entities(blocks)
    if not entities:
        return ""
    rows: list[str] = []
    for block_name, entity_id, title, item in entities:
        links = item.get("relates_to", []) + item.get("validation", []) + item.get("validates", [])
        connected = render_traceability_links(links)
        evidence = ", ".join(f"<code>{escape_html(reference)}</code>" for reference in item.get("evidence", [])) or "—"
        exception = escape_html(item.get("exception", "")) if item.get("exception") else "—"
        rows.append(
            "<tr>"
            f'<td><a href="#{escape_html(entity_id)}">{escape_html(item.get("label", entity_label(entity_id)))}</a></td>'
            f"<td>{escape_html(BLOCK_SPECS[block_name].title)}</td>"
            f"<td>{escape_html(title)}</td>"
            f"<td>{connected}</td>"
            f"<td>{evidence}</td>"
            f"<td>{exception}</td>"
            "</tr>"
        )
    return (
        '<section id="traceability" class="section" data-block="traceability" data-block-category="delivery-assurance" '
        'data-review-area="validation decisions" aria-labelledby="traceability-heading">'
        '<div class="section-heading"><span>TR</span><div><h2 id="traceability-heading">'
        '<a href="#traceability">Traceability view</a></h2>'
        '<p>Generated relationships between requirements, decisions, risks, questions, and validation outcomes.</p>'
        '</div></div><div class="table-wrap traceability-table"><table class="id-table"><thead><tr>'
        '<th>ID</th><th>Type</th><th>Statement</th><th>Connected entities</th><th>Evidence</th><th>Exception</th>'
        f'</tr></thead><tbody>{"".join(rows)}</tbody></table></div></section>'
    )


__all__ = ["render_traceability_view"]