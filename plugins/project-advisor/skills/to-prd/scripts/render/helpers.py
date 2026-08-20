"""Shared HTML rendering helpers for PRD bundle output."""

from __future__ import annotations

import html

from ..spec import entity_anchor, entity_label

CATEGORY_LABELS = {
    "framing": "Framing",
    "people-workflow": "People and workflow",
    "product-definition": "Product definition",
    "visual-experience": "Visual experience",
    "technical-contracts": "Technical contracts",
    "delivery-assurance": "Delivery and assurance",
}

# The cyclorama's cue ladder. Each block category holds one level of the dawn
# sequence, so a document lights up in the order it argues: framing in the dark,
# delivery and assurance in full day.
CATEGORY_LEVELS = {
    "framing": 0,
    "people-workflow": 10,
    "product-definition": 20,
    "visual-experience": 30,
    "technical-contracts": 40,
    "delivery-assurance": 50,
}


def escape_html(value: str) -> str:
    return html.escape(value, quote=True)


def render_list(items: list[str]) -> str:
    return '<ul class="content-list">' + "".join(
        f"<li>{escape_html(item)}</li>" for item in items
    ) + "</ul>"


def field_label(field: str) -> str:
    return field.replace("_", " ").capitalize()


def category_label(category: str) -> str:
    return CATEGORY_LABELS.get(category, field_label(category))


def category_level(category: str) -> int:
    return CATEGORY_LEVELS.get(category, 0)


def render_row(label: str, value: str) -> str:
    return f"<div><dt>{escape_html(label)}</dt><dd>{value}</dd></div>"


def render_relationship_row(label: str, references: list[str]) -> str:
    if not references:
        return ""
    links = ", ".join(
        f'<a class="cue-code" href="#{escape_html(entity_anchor(reference))}">'
        f"{escape_html(entity_label(reference))}</a>"
        for reference in references
    )
    return render_row(label, links)


def render_evidence_row(references: list[str]) -> str:
    if not references:
        return ""
    evidence = ", ".join(f"<code>{escape_html(reference)}</code>" for reference in references)
    return render_row("Evidence", evidence)


def render_plate_rows(item: dict) -> str:
    rows = "".join(
        [
            render_relationship_row("Related", item.get("relates_to", [])),
            render_relationship_row("Validation", item.get("validation", [])),
            render_relationship_row("Validates", item.get("validates", [])),
            render_evidence_row(item.get("evidence", [])),
            (
                render_row("Deferred", escape_html(item["exception"]))
                if item.get("exception")
                else ""
            ),
        ]
    )
    return f'<dl class="plate-rows">{rows}</dl>' if rows else ""


def render_aspect(aspect: dict | None) -> str:
    if not aspect:
        return ""
    state = aspect["state"]
    word = "Up" if state == "up" else "Held"
    return (
        f'<span class="aspect" data-aspect="{escape_html(state)}">'
        '<span class="lamp" aria-hidden="true"></span>'
        f'<span class="aspect-word">{escape_html(word)}</span>'
        f'<span class="aspect-reason">{escape_html(aspect["title"])}</span></span>'
    )


__all__ = [
    "CATEGORY_LABELS",
    "CATEGORY_LEVELS",
    "category_label",
    "category_level",
    "escape_html",
    "field_label",
    "render_aspect",
    "render_evidence_row",
    "render_list",
    "render_plate_rows",
    "render_relationship_row",
    "render_row",
]
