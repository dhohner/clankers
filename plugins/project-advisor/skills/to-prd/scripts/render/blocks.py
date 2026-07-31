"""Block-specific rendering for normalized PRD content."""

from __future__ import annotations

from typing import Any

from ..spec import BlockSpec, entity_label
from .helpers import (
    escape_html,
    field_label,
    render_aspect,
    render_list,
    render_plate_rows,
    render_row,
)
from .visuals import render_frames, render_mermaid_diagram


def render_requirements(items: list[dict[str, Any]], spec: BlockSpec, aspects: dict) -> str:
    plates: list[str] = []
    for index, item in enumerate(items, start=1):
        entity_id = item.get("id", f"{spec.id_prefix}-{index:02d}")
        label = item.get("label", entity_label(entity_id))
        aspect = aspects.get(entity_id)
        plates.append(
            f'<article id="{escape_html(entity_id)}" class="plate requirement-plate"'
            f' data-aspect="{escape_html(aspect["state"]) if aspect else "up"}">'
            '<div class="plate-head">'
            f'<a class="cue-code" href="#{escape_html(entity_id)}" '
            f'aria-label="Link to {escape_html(label)}">{escape_html(label)}</a>'
            f"{render_aspect(aspect)}</div>"
            '<div class="plate-body">'
            f'<h3>{escape_html(item["title"])}</h3>'
            f'<p>{escape_html(item["description"])}</p>'
            f"{render_plate_rows(item)}</div></article>"
        )
    return '<div class="requirement-list">' + "".join(plates) + "</div>"


def render_cards(name: str, items: list[dict[str, Any]], spec: BlockSpec, aspects: dict) -> str:
    if name == "requirements":
        return render_requirements(items, spec, aspects)

    if name == "goals":
        rows = "".join(
            "<tr>"
            f'<td><span class="cue-code">GOAL-{index:02d}</span></td>'
            f"<td>{escape_html(item['goal'])}</td>"
            f"<td>{escape_html(item['success_signal'])}</td>"
            "</tr>"
            for index, item in enumerate(items, start=1)
        )
        return (
            '<div class="table-wrap"><table><thead><tr>'
            "<th>ID</th><th>Goal</th><th>Success signal</th>"
            f"</tr></thead><tbody>{rows}</tbody></table></div>"
        )
    if name == "rollout":
        return '<ol class="sequence">' + "".join(
            f'<li><span class="sequence-index" aria-hidden="true">{index:02d}</span>'
            '<div class="sequence-content">'
            f'<h3>{escape_html(item["phase"])}</h3>'
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

    plates: list[str] = []
    primary, *secondary = spec.fields
    for index, item in enumerate(items, start=1):
        head = ""
        anchor = ""
        aspect = None
        if spec.id_prefix and spec.label_prefix:
            entity_id = item.get("id", f"{spec.id_prefix}-{index:02d}")
            label = item.get("label", entity_label(entity_id))
            aspect = aspects.get(entity_id)
            anchor = f' id="{escape_html(entity_id)}"'
            head = (
                '<div class="plate-head">'
                f'<a class="cue-code" href="#{escape_html(entity_id)}" '
                f'aria-label="Link to {escape_html(label)}">{escape_html(label)}</a>'
                f"{render_aspect(aspect)}</div>"
            )
        else:
            head = ""
        rows = "".join(
            render_row(field_label(field), escape_html(item[field])) for field in secondary
        )
        relationships = render_plate_rows(item)
        body_rows = (
            f'<dl class="plate-rows">{rows}</dl>{relationships}'
            if rows
            else relationships
        )
        aspect_attribute = f' data-aspect="{escape_html(aspect["state"])}"' if aspect else ""
        plates.append(
            f"<article{anchor} class=\"plate{' entity-plate' if anchor else ''}\""
            f"{aspect_attribute}>{head}"
            '<div class="plate-body">'
            f"<h3>{escape_html(item[primary])}</h3>{body_rows}</div></article>"
        )

    # Two columns at most: a card that has to share a row with two others gives
    # its prose too little measure to read well.
    return '<div class="plate-grid plate-grid--2">' + "".join(plates) + "</div>"


def render_table(value: dict[str, Any]) -> str:
    head = "".join(f"<th>{escape_html(column)}</th>" for column in value["columns"])
    rows = "".join(
        "<tr>" + "".join(f"<td>{escape_html(cell)}</td>" for cell in row) + "</tr>"
        for row in value["rows"]
    )
    return (
        '<div class="table-wrap"><table><thead><tr>'
        f"{head}</tr></thead><tbody>{rows}</tbody></table></div>"
    )


def render_block_content(
    name: str,
    value: Any,
    spec: BlockSpec,
    aspects: dict | None = None,
) -> str:
    aspects = aspects or {}
    if spec.kind == "summary":
        metrics = "".join(
            '<article class="readout">'
            f"<span class=\"readout-label\">{escape_html(item['label'])}</span>"
            f"<strong class=\"readout-value\">{escape_html(item['value'])}</strong>"
            f"<p>{escape_html(item['description'])}</p></article>"
            for item in value["metrics"]
        )
        return (
            f'<div class="readout-grid">{metrics}</div>'
            '<div class="callout"><strong>Recommendation</strong>'
            f"<p>{escape_html(value['recommendation'])}</p></div>"
        )
    if spec.kind == "cards":
        return render_cards(name, value, spec, aspects)
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
            '<div class="split"><article class="scope-in"><h3>In scope</h3>'
            f"{render_list(value['in'])}</article>"
            '<article class="scope-out"><h3>Out of scope</h3>'
            f"{render_list(value['out'])}</article></div>"
        )
    if spec.kind == "diagram":
        if value["source"]:
            return render_mermaid_diagram(name, value)
        return (
            '<figure class="diagram-brief">'
            f"<p>{escape_html(value['description'])}</p>"
            "<figcaption>Text-first diagram brief; visual rendering is optional.</figcaption>"
            "</figure>"
        )
    if spec.kind == "table":
        return render_table(value)
    if spec.kind == "questions":
        plates: list[str] = []
        for index, question in enumerate(value, start=1):
            entity_id = question.get("id", f"question-{index:02d}")
            label = question.get("label", entity_label(entity_id))
            aspect = aspects.get(entity_id)
            plates.append(
                f'<article id="{escape_html(entity_id)}" class="plate entity-plate"'
                f' data-aspect="{escape_html(aspect["state"]) if aspect else "up"}">'
                '<div class="plate-head">'
                f'<a class="cue-code" href="#{escape_html(entity_id)}" '
                f'aria-label="Link to {escape_html(label)}">{escape_html(label)}</a>'
                f"{render_aspect(aspect)}</div>"
                '<div class="plate-body">'
                f"<h3>{escape_html(question['question'])}</h3>"
                f"{render_plate_rows(question)}</div></article>"
            )
        return '<div class="plate-grid plate-grid--2">' + "".join(plates) + "</div>"
    if spec.kind == "code":
        snippets = "".join(
            '<article class="code-sample">'
            '<div class="plate-head">'
            f"<span class=\"cue-code\">{escape_html(item['reference'])}</span>"
            f"<span class=\"code-language\">{escape_html(item['language'])}</span></div>"
            f"<p>{escape_html(item['annotation'])}</p>"
            f'<pre><code data-language="{escape_html(item["language"])}">'
            f"{escape_html(item['code'])}</code></pre></article>"
            for item in value
        )
        return f'<div class="code-grid">{snippets}</div>'
    raise RuntimeError(f"unsupported renderer kind for {name}: {spec.kind}")


__all__ = ["render_block_content"]
