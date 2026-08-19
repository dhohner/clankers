"""Design tree rendering: one Mermaid graph and the full node text below it."""

from __future__ import annotations

from typing import Any

from ..mermaid import mermaid_label
from ..spec import entity_label, iter_tree_nodes
from .helpers import (
    escape_html,
    render_evidence_row,
    render_relationship_row,
    render_row,
)
from .visuals import render_mermaid_diagram

TREE_DESCRIPTION = (
    "Every interview question behind this PRD, and how each branch ended: "
    "settled with an answer, pruned out of scope, or deferred to an open question."
)
STATUS_WORDS = {
    "settled": "Settled",
    "pruned": "Pruned",
    "deferred": "Deferred",
}
# Shape carries the status as well as colour, so the graph stays readable in a
# monochrome print and for a reader who cannot separate the palette.
STATUS_SHAPES = {
    "settled": ('["', '"]'),
    "pruned": ('[/"', '"/]'),
    "deferred": ('(["', '"])'),
}
STATUS_CLASS_DEFINITIONS = {
    "settled": "  classDef settled fill:#101a33,stroke:#8497ff,stroke-width:1.4px,color:#e7e9f2",
    "pruned": "  classDef pruned fill:#101018,stroke:#7f87a3,stroke-width:1.2px,color:#a2a9c2,stroke-dasharray:5 4",
    "deferred": "  classDef deferred fill:#231029,stroke:#ff7bae,stroke-width:1.4px,color:#ffd7e6,stroke-dasharray:2 3",
}


def tree_mermaid_source(nodes: list[dict[str, Any]]) -> str:
    graph_ids = {
        node["id"]: f"n{index}"
        for index, node in enumerate(iter_tree_nodes(nodes), start=1)
    }
    declarations: list[str] = []
    edges: list[str] = []
    classes: list[str] = []
    statuses: set[str] = set()
    for node in iter_tree_nodes(nodes):
        graph_id = graph_ids[node["id"]]
        status = node["status"]
        opening, closing = STATUS_SHAPES[status]
        label = mermaid_label(f"{entity_label(node['id'])} {node['label']}")
        declarations.append(f"  {graph_id}{opening}{label}{closing}")
        classes.append(f"  class {graph_id} {status}")
        statuses.add(status)
        edges.extend(
            f"  {graph_id} --> {graph_ids[child['id']]}"
            for child in node.get("children", [])
        )
    definitions = [
        definition
        for status, definition in STATUS_CLASS_DEFINITIONS.items()
        if status in statuses
    ]
    return "\n".join(["flowchart TB", *declarations, *edges, *definitions, *classes])


def _node_rows(node: dict[str, Any]) -> str:
    rows = [render_row("Question", escape_html(node["question"]))]
    if node["status"] == "settled":
        rows.append(render_row("Answer", escape_html(node["answer"])))
        rows.append(render_row("Rationale", escape_html(node["rationale"])))
        rows.append(render_row("Source", escape_html(node["source"].capitalize())))
        if node.get("superseded_answer"):
            rows.append(
                render_row("Superseded answer", escape_html(node["superseded_answer"]))
            )
    if node["status"] == "pruned":
        rows.append(render_row("Reason", escape_html(node["reason"])))
    rows.append(render_relationship_row("Related", node.get("relates_to", [])))
    rows.append(render_evidence_row(node.get("evidence", [])))
    return f'<dl class="plate-rows">{"".join(rows)}</dl>'


def _open_node(node: dict[str, Any]) -> str:
    entity_id = node["id"]
    label = entity_label(entity_id)
    status = node["status"]
    return (
        f'<li id="{escape_html(entity_id)}" class="tree-node" '
        f'data-status="{escape_html(status)}">'
        '<div class="tree-node-head">'
        f'<a class="cue-code" href="#{escape_html(entity_id)}" '
        f'aria-label="Link to {escape_html(label)}">{escape_html(label)}</a>'
        f'<span class="tree-status" data-status="{escape_html(status)}">'
        '<span class="lamp" aria-hidden="true"></span>'
        f'<span class="tree-status-word">{STATUS_WORDS[status]}</span></span></div>'
        f'<h3>{escape_html(node["label"])}</h3>'
        f"{_node_rows(node)}"
    )


def _render_nodes(nodes: list[dict[str, Any]]) -> str:
    """Render the outline in one pass over an explicit stack.

    Depth comes from author input, so the walk neither recurses nor keeps a
    rendered subtree per node: every fragment is emitted once and joined once.
    """
    parts: list[str] = ['<ol class="design-tree">']
    pending: list[tuple[bool, Any]] = [(False, "</ol>")]
    pending.extend((True, node) for node in reversed(nodes))
    while pending:
        is_node, item = pending.pop()
        if not is_node:
            parts.append(item)
            continue
        parts.append(_open_node(item))
        children = item.get("children", [])
        if not children:
            parts.append("</li>")
            continue
        parts.append('<ol class="tree-branches">')
        pending.append((False, "</ol></li>"))
        pending.extend((True, child) for child in reversed(children))
    return "".join(parts)


def render_design_tree(name: str, nodes: list[dict[str, Any]]) -> str:
    graph = render_mermaid_diagram(
        name,
        {"description": TREE_DESCRIPTION, "source": tree_mermaid_source(nodes)},
    )
    return f"{graph}{_render_nodes(nodes)}"


__all__ = ["render_design_tree", "tree_mermaid_source"]
