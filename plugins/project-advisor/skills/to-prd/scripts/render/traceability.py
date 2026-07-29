"""Traceability coverage reporting for normalized PRD entities."""

from __future__ import annotations

from typing import Any

from ..spec import BLOCK_SPECS, entity_label
from ..manifest_types import NormalizedBlocks
from .helpers import escape_html


RELATIONSHIP_FIELDS = ("relates_to", "validation", "validates")

ENTITY_NOUNS = {
    "requirements": "requirement",
    "decisions": "decision",
    "risks": "risk",
    "testing_strategy": "validation outcome",
    "open_questions": "open question",
}


def iter_entities(blocks: NormalizedBlocks) -> list[dict[str, Any]]:
    """Return every entity that carries a stable ID, in catalog order."""
    entities: list[dict[str, Any]] = []
    for block_name, items in blocks.items():
        spec = BLOCK_SPECS[block_name]
        if not spec.id_prefix:
            continue
        title_field = "question" if spec.kind == "questions" else spec.fields[0]
        for item in items:
            entities.append(
                {
                    "block": block_name,
                    "id": item["id"],
                    "label": item.get("label", entity_label(item["id"])),
                    "statement": item.get(title_field, ""),
                    "item": item,
                }
            )
    return entities


def connection_index(entities: list[dict[str, Any]]) -> dict[str, set[str]]:
    """Map every entity ID to the IDs it references and the IDs referencing it."""
    connections: dict[str, set[str]] = {entity["id"]: set() for entity in entities}
    for entity in entities:
        for field in RELATIONSHIP_FIELDS:
            for reference in entity["item"].get(field, []):
                connections[entity["id"]].add(reference)
                if reference in connections:
                    connections[reference].add(entity["id"])
    return connections


def coverage_gap(entity: dict[str, Any], connections: set[str]) -> tuple[str, str] | None:
    """Return the gap title and detail for an entity, or None when it is covered."""
    block = entity["block"]
    item = entity["item"]
    linked_prefixes = {reference.split("-", 1)[0] for reference in connections}
    if block == "requirements":
        if item.get("exception"):
            return ("Validation deferred", item["exception"])
        if not {"dec", "risk"} & linked_prefixes:
            return (
                "No decision or risk context",
                "Nothing on this page records why the requirement was chosen or what threatens it.",
            )
        return None
    if "req" in linked_prefixes:
        return None
    noun = ENTITY_NOUNS.get(block, "entry")
    if block == "testing_strategy":
        return (
            "Validates no requirement",
            "This outcome is not connected to a requirement it proves.",
        )
    return (
        "Not connected to a requirement",
        f"This {noun} does not name a requirement it affects.",
    )


def render_coverage_rows(gaps: list[tuple[dict[str, Any], tuple[str, str]]]) -> str:
    rows: list[str] = []
    for entity, (title, detail) in gaps:
        rows.append(
            "<tr>"
            f'<td><a href="#{escape_html(entity["id"])}">{escape_html(entity["label"])}</a></td>'
            f"<td>{escape_html(BLOCK_SPECS[entity['block']].title)}</td>"
            f"<td>{escape_html(entity['statement'])}</td>"
            f'<td><strong class="coverage-gap">{escape_html(title)}</strong>'
            f'<span class="coverage-detail">{escape_html(detail)}</span></td>'
            "</tr>"
        )
    return "".join(rows)


def render_traceability_view(blocks: NormalizedBlocks) -> str:
    entities = iter_entities(blocks)
    if not entities:
        return ""
    connections = connection_index(entities)
    gaps = [
        (entity, gap)
        for entity in entities
        if (gap := coverage_gap(entity, connections[entity["id"]])) is not None
    ]

    tracked = len(entities)
    tracked_noun = "entity" if tracked == 1 else "entities"
    if gaps:
        summary = (
            f"{len(gaps)} of {tracked} tracked {tracked_noun} still need a connection "
            "or carry a deferred validation outcome. Everything not listed here is covered."
        )
        content = (
            '<div class="table-wrap traceability-table">'
            '<table class="id-table coverage-table"><thead><tr>'
            "<th>ID</th><th>Type</th><th>Statement</th><th>Coverage gap</th>"
            f"</tr></thead><tbody>{render_coverage_rows(gaps)}</tbody></table></div>"
        )
    else:
        summary = (
            f"All {tracked} tracked {tracked_noun} connect to the product intent they support."
        )
        content = (
            '<div class="callout neutral"><strong>Coverage complete</strong>'
            "<p>Every requirement has a validation outcome, and every decision, risk, "
            "open question, and validation outcome names a requirement it affects. "
            "Relationships are listed on each entity above.</p></div>"
        )

    return (
        '<section id="traceability" class="section" data-block="traceability" data-block-category="delivery-assurance" '
        'data-review-area="validation decisions" aria-labelledby="traceability-heading">'
        '<div class="section-heading"><div><h2 id="traceability-heading">'
        '<a href="#traceability">Traceability and coverage</a></h2>'
        f"<p>{escape_html(summary)}</p>"
        f"</div></div>{content}</section>"
    )


__all__ = ["render_traceability_view"]
