"""Design tree rendering: one Mermaid graph of the interview branches."""

from __future__ import annotations

from typing import Any

from ..mermaid import mermaid_label
from ..spec import entity_label, iter_tree_nodes
from .visuals import render_mermaid_diagram

TREE_DESCRIPTION = (
    "Every interview question behind this PRD, and how each branch ended: "
    "settled with an answer, pruned out of scope, or deferred to an open question. "
    "Each node names its status, and the shape repeats it: a rectangle is settled, "
    "a slanted box is pruned, and a rounded box is deferred."
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
        label = mermaid_label(
            f"{entity_label(node['id'])} {node['label']} ({STATUS_WORDS[status]})"
        )
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


def render_design_tree(name: str, nodes: list[dict[str, Any]]) -> str:
    return render_mermaid_diagram(
        name,
        {"description": TREE_DESCRIPTION, "source": tree_mermaid_source(nodes)},
    )


__all__ = ["render_design_tree", "tree_mermaid_source"]
