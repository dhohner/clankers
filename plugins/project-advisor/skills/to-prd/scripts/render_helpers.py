"""Shared HTML rendering helpers for PRD bundle output."""

from __future__ import annotations

import html

from .spec import entity_label


def escape_html(value: str) -> str:
    return html.escape(value, quote=True)


def render_list(items: list[str]) -> str:
    return '<ul class="content-list">' + "".join(
        f"<li>{escape_html(item)}</li>" for item in items
    ) + "</ul>"


def field_label(field: str) -> str:
    return field.replace("_", " ").capitalize()


def render_relationship_links(label: str, references: list[str]) -> str:
    if not references:
        return ""
    links = ", ".join(
        f'<a href="#{escape_html(reference)}">{escape_html(entity_label(reference))}</a>'
        for reference in references
    )
    return f'<p class="entity-links"><strong>{escape_html(label)}:</strong> {links}</p>'


def render_evidence_items(references: list[str]) -> str:
    if not references:
        return ""
    evidence = ", ".join(f"<code>{escape_html(reference)}</code>" for reference in references)
    return f'<p class="entity-evidence"><strong>Evidence:</strong> {evidence}</p>'


__all__ = [
    "escape_html",
    "field_label",
    "render_evidence_items",
    "render_list",
    "render_relationship_links",
]