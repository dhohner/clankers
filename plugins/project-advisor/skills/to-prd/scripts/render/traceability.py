"""Traceability coverage reporting for normalized PRD entities."""

from __future__ import annotations

from typing import Any, TypedDict

from ..manifest_types import NormalizedBlocks
from ..spec import BLOCK_SPECS, entity_label
from .helpers import escape_html

RELATIONSHIP_FIELDS = ("relates_to", "validation", "validates")

ENTITY_NOUNS = {
    "requirements": "requirement",
    "decisions": "decision",
    "risks": "risk",
    "testing_strategy": "validation outcome",
    "open_questions": "open question",
}


class EntityAspect(TypedDict):
    state: str
    title: str
    detail: str


class CoverageReport(TypedDict):
    entities: list[dict[str, Any]]
    aspects: dict[str, EntityAspect]
    gaps: list[tuple[dict[str, Any], tuple[str, str]]]
    tracked: int
    held: int
    up: int
    percent: int


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


def coverage_report(blocks: NormalizedBlocks) -> CoverageReport:
    entities = iter_entities(blocks)
    connections = connection_index(entities)
    aspects: dict[str, EntityAspect] = {}
    gaps: list[tuple[dict[str, Any], tuple[str, str]]] = []
    for entity in entities:
        gap = coverage_gap(entity, connections[entity["id"]])
        if gap is None:
            aspects[entity["id"]] = {
                "state": "up",
                "title": "Connected",
                "detail": "This entity names the product intent it supports.",
            }
            continue
        title, detail = gap
        aspects[entity["id"]] = {"state": "held", "title": title, "detail": detail}
        gaps.append((entity, gap))
    tracked = len(entities)
    held = len(gaps)
    up = tracked - held
    return {
        "entities": entities,
        "aspects": aspects,
        "gaps": gaps,
        "tracked": tracked,
        "held": held,
        "up": up,
        "percent": round(up / tracked * 100) if tracked else 0,
    }


def board_state(report: CoverageReport) -> tuple[str, str]:
    tracked = report["tracked"]
    held = report["held"]
    if not tracked:
        return (
            "No board",
            "This PRD tracks no stable entities, so there is no coverage to read.",
        )
    noun = "entity" if tracked == 1 else "entities"
    if not held:
        return (
            "Board clear",
            f"All {tracked} tracked {noun} connect to the product intent they support.",
        )
    return (
        f"{held} held",
        (
            f"{held} of {tracked} tracked {noun} still need a connection or carry a "
            "deferred validation outcome. All other tracked entities are up."
        ),
    )


def render_coverage_rows(gaps: list[tuple[dict[str, Any], tuple[str, str]]]) -> str:
    rows: list[str] = []
    for entity, (title, detail) in gaps:
        rows.append(
            "<tr>"
            f'<td><a class="cue-code" href="#{escape_html(entity["id"])}">'
            f'{escape_html(entity["label"])}</a></td>'
            f"<td>{escape_html(BLOCK_SPECS[entity['block']].title)}</td>"
            f"<td>{escape_html(entity['statement'])}</td>"
            f'<td><strong class="coverage-gap">{escape_html(title)}</strong>'
            f'<span class="coverage-detail">{escape_html(detail)}</span></td>'
            "</tr>"
        )
    return "".join(rows)


def render_traceability_content(report: CoverageReport) -> str:
    tracked = report["tracked"]
    held = report["held"]
    up = report["up"]
    percent = report["percent"]
    headline, reading = board_state(report)
    ladder = (
        '<div class="board-ladder">'
        f'<div class="board-meter" role="img" aria-label="{up} of {tracked} tracked '
        f'entities are up, {percent} percent coverage">'
        f'<span class="board-meter-fill" style="--board-fill: {percent}%"></span>'
        "</div>"
        '<dl class="board-readout">'
        f"<div><dt>Up</dt><dd>{up}</dd></div>"
        f"<div><dt>Held</dt><dd>{held}</dd></div>"
        f"<div><dt>Tracked</dt><dd>{tracked}</dd></div>"
        f"<div><dt>Coverage</dt><dd>{percent}<span>%</span></dd></div>"
        "</dl></div>"
    )
    if held:
        detail = (
            '<div class="table-wrap traceability-table">'
            '<table class="coverage-table"><caption>Cues still held</caption><thead><tr>'
            "<th>ID</th><th>Type</th><th>Statement</th><th>Coverage gap</th>"
            f"</tr></thead><tbody>{render_coverage_rows(report['gaps'])}</tbody></table></div>"
        )
    else:
        detail = (
            '<div class="callout"><strong>Coverage rule</strong>'
            "<p>Every requirement has a validation outcome, and every decision, risk, "
            "open question, and validation outcome names a requirement it affects. "
            "Each entity lists its own connections above.</p></div>"
        )
    return (
        f'<p class="board-headline"><strong>{escape_html(headline)}</strong>'
        f"<span>{escape_html(reading)}</span></p>{ladder}{detail}"
    )


__all__ = [
    "CoverageReport",
    "EntityAspect",
    "board_state",
    "coverage_report",
    "render_traceability_content",
]
