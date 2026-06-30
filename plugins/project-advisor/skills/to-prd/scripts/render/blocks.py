"""Block-specific rendering for normalized PRD content."""

from __future__ import annotations

from typing import Any

from ..spec import BlockSpec, entity_label
from .helpers import (
    escape_html,
    field_label,
    render_evidence_items,
    render_list,
    render_relationship_links,
)
from .visuals import render_frames, render_mermaid_diagram


def render_cards(name: str, items: list[dict[str, Any]], spec: BlockSpec) -> str:
    if name == "requirements":
        requirements: list[str] = []
        for index, item in enumerate(items, start=1):
            entity_id = item.get("id", f"{spec.id_prefix}-{index:02d}")
            label = item.get("label", entity_label(entity_id))
            relationships = "".join(
                [
                    render_relationship_links("Related", item.get("relates_to", [])),
                    render_relationship_links("Validation", item.get("validation", [])),
                    render_evidence_items(item.get("evidence", [])),
                    (
                        f'<p class="entity-exception"><strong>Validation exception:</strong> {escape_html(item["exception"])}</p>'
                        if item.get("exception")
                        else ""
                    ),
                ]
            )
            requirements.append(
                f'<article id="{escape_html(entity_id)}">'
                f'<a class="entity-id" href="#{escape_html(entity_id)}" '
                f'aria-label="Link to {escape_html(label)}">{escape_html(label)}</a>'
                f'<div><h3>{escape_html(item["title"])}</h3>'
                f'<p>{escape_html(item["description"])}</p>{relationships}</div></article>'
            )
        return '<div class="requirement-list">' + "".join(requirements) + "</div>"

    cards: list[str] = []
    for index, item in enumerate(items, start=1):
        identity = ""
        anchor = ""
        if spec.id_prefix and spec.label_prefix:
            entity_id = item.get("id", f"{spec.id_prefix}-{index:02d}")
            label = item.get("label", entity_label(entity_id))
            anchor = f' id="{escape_html(entity_id)}"'
            identity = (
                f'<a class="entity-id" href="#{escape_html(entity_id)}" '
                f'aria-label="Link to {escape_html(label)}">{escape_html(label)}</a>'
            )
        primary, *secondary = spec.fields
        details = "".join(
            f"<p><strong>{escape_html(field_label(field))}:</strong> {escape_html(item[field])}</p>"
            for field in secondary
        )
        relationships = "".join(
            [
                render_relationship_links("Related", item.get("relates_to", [])),
                render_relationship_links("Validation", item.get("validation", [])),
                render_relationship_links("Validates", item.get("validates", [])),
                render_evidence_items(item.get("evidence", [])),
                (
                    f'<p class="entity-exception"><strong>Validation exception:</strong> {escape_html(item["exception"])}</p>'
                    if item.get("exception")
                    else ""
                ),
            ]
        )
        cards.append(
            f'<article{anchor} class="card{" entity-card" if anchor else ""}">'
            f"{identity}<h3>{escape_html(item[primary])}</h3>{details}{relationships}</article>"
        )

    if name == "goals":
        rows = "".join(
            "<tr>"
            f"<td>GOAL-{index:02d}</td>"
            f"<td>{escape_html(item['goal'])}</td>"
            f"<td>{escape_html(item['success_signal'])}</td>"
            "</tr>"
            for index, item in enumerate(items, start=1)
        )
        return (
            '<div class="table-wrap"><table class="id-table"><thead><tr>'
            "<th>ID</th><th>Goal</th><th>Success signal</th>"
            f"</tr></thead><tbody>{rows}</tbody></table></div>"
        )
    if name == "rollout":
        return '<ol class="timeline">' + "".join(
            f"<li><span>Phase {index}</span>"
            f"<div><h3>{escape_html(item['phase'])}</h3>"
            f"<p>{escape_html(item['outcome'])}</p></div></li>"
            for index, item in enumerate(items, start=1)
        ) + "</ol>"
    if name == "repository_grounding":
        rows = "".join(
            "<tr>"
            f"<td><code>{escape_html(item['reference'])}</code></td>"
            f"<td>{escape_html(item['observation'])}</td>"
            f"<td>{escape_html(item['implication'])}</td>"
            "</tr>"
            for item in items
        )
        return (
            '<div class="table-wrap"><table><thead><tr>'
            "<th>Evidence</th><th>Observed constraint</th><th>Implication</th>"
            f"</tr></thead><tbody>{rows}</tbody></table></div>"
        )

    grid_class = {
        "decisions": "decision-grid",
        "risks": "risk-list",
        "testing_strategy": "validation-list",
        "capability_map": "block-grid",
    }.get(name, "card-grid")
    return f'<div class="{grid_class}">' + "".join(cards) + "</div>"


def render_table(value: dict[str, Any]) -> str:
    head = "".join(f"<th>{escape_html(column)}</th>" for column in value["columns"])
    rows = "".join(
        "<tr>" + "".join(f"<td>{escape_html(cell)}</td>" for cell in row) + "</tr>"
        for row in value["rows"]
    )
    table_class = ' class="id-table"' if value["columns"][0] == "ID" else ""
    return (
        f'<div class="table-wrap"><table{table_class}><thead><tr>'
        f"{head}</tr></thead><tbody>{rows}</tbody></table></div>"
    )


def render_block_content(name: str, value: Any, spec: BlockSpec) -> str:
    if spec.kind == "summary":
        metrics = "".join(
            '<article class="metric">'
            f"<span>{escape_html(item['label'])}</span>"
            f"<strong>{escape_html(item['value'])}</strong>"
            f"<p>{escape_html(item['description'])}</p></article>"
            for item in value["metrics"]
        )
        return (
            f'<div class="metric-grid">{metrics}</div>'
            '<div class="callout"><strong>Recommendation</strong>'
            f"<p>{escape_html(value['recommendation'])}</p></div>"
        )
    if spec.kind == "cards":
        return render_cards(name, value, spec)
    if spec.kind == "frames":
        return render_frames(name, value, spec)
    if spec.kind == "list":
        return render_list(value)
    if spec.kind == "problem":
        return (
            '<div class="split"><article><h3>Problem statement</h3>'
            f"<p>{escape_html(value['statement'])}</p></article>"
            f"<article><h3>Evidence</h3>{render_list(value['evidence'])}</article></div>"
        )
    if spec.kind == "scope":
        return (
            '<div class="split"><article><h3>In scope</h3>'
            f"{render_list(value['in'])}</article><article><h3>Out of scope</h3>"
            f"{render_list(value['out'])}</article></div>"
        )
    if spec.kind == "diagram":
        if value["source"]:
            return render_mermaid_diagram(name, value)
        return (
            '<figure class="diagram-brief">'
            '<div>'
            f"<p>{escape_html(value['description'])}</p></div>"
            '<figcaption>Text-first diagram brief; visual rendering is optional.</figcaption>'
            "</figure>"
        )
    if spec.kind == "table":
        return render_table(value)
    if spec.kind == "questions":
        rows: list[str] = []
        for index, question in enumerate(value, start=1):
            entity_id = question.get("id", f"question-{index:02d}")
            label = question.get("label", entity_label(entity_id))
            links = "".join(
                [
                    render_relationship_links("Related", question.get("relates_to", [])),
                    render_evidence_items(question.get("evidence", [])),
                ]
            )
            rows.append(
                f'<article id="{escape_html(entity_id)}">'
                f'<a class="entity-id" href="#{escape_html(entity_id)}" '
                f'aria-label="Link to {escape_html(label)}">{escape_html(label)}</a>'
                f"<h3>{escape_html(question['question'])}</h3>{links}</article>"
            )
        return f'<div class="question-list">{"".join(rows)}</div>'
    if spec.kind == "code":
        snippets = "".join(
            '<article class="code-sample">'
            f"<h3><code>{escape_html(item['reference'])}</code></h3>"
            f"<p>{escape_html(item['annotation'])}</p>"
            f'<pre><code data-language="{escape_html(item["language"])}">'
            f"{escape_html(item['code'])}</code></pre></article>"
            for item in value
        )
        return f'<div class="code-grid">{snippets}</div>'
    raise RuntimeError(f"unsupported renderer kind for {name}: {spec.kind}")


__all__ = ["render_block_content"]