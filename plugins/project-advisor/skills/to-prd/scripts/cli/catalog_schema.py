"""Schema catalog command for the PRD bundle CLI."""

from __future__ import annotations

import argparse
from typing import Any

from ..spec import (
    BLOCK_SPECS,
    DESIGN_TREE_SOURCES,
    DESIGN_TREE_STATUSES,
    ENTITY_OPTIONAL_FIELDS_BY_BLOCK,
    INITIATIVE_TYPES,
    REQUIRED_SURFACES_BY_INITIATIVE,
    REVIEW_SURFACES,
)
from .catalog_blocks import example_block
from .support import CliFailure, next_command


def command_schema(args: argparse.Namespace) -> dict[str, Any]:
    blocks = list(getattr(args, "blocks", []))
    if getattr(args, "authoring", False):
        if blocks:
            raise CliFailure(
                {
                    "status": "error",
                    "code": "schema_authoring_with_blocks",
                    "errors": [
                        {
                            "path": "blocks",
                            "message": "--authoring cannot be combined with block names",
                            "fix": "Use schema --authoring or schema <block> [block ...].",
                        }
                    ],
                }
            )
        return _authoring_schema()
    if blocks:
        if len(blocks) == 1:
            return _block_schema(blocks[0])
        return {
            "status": "ok",
            "schema_version": 1,
            "schemas": [_block_schema(block, compact=True) for block in blocks],
            "next": [
                next_command("examples minimal-prd"),
                next_command("validate <prd.yaml>"),
            ],
        }
    return {
        "status": "ok",
        "schema_version": 1,
        "initiative_types": sorted(INITIATIVE_TYPES),
        "review_surfaces": sorted(REVIEW_SURFACES),
        "required_review_surfaces_by_initiative": {
            name: _ordered_surfaces(surfaces)
            for name, surfaces in sorted(REQUIRED_SURFACES_BY_INITIATIVE.items())
        },
        "constraints": [
            "Every initiative requires document in review_surfaces.",
            "Each *-heavy initiative also requires its matching review surface.",
            "mixed requires document and at least two non-document review surfaces.",
        ],
        "blocks": [
            {
                "name": name,
                "title": spec.title,
                "kind": spec.kind,
                "fields": list(spec.fields),
            }
            for name, spec in BLOCK_SPECS.items()
        ],
        "next": [
            next_command("schema requirements testing_strategy"),
            next_command("examples minimal-prd"),
        ],
    }


def _authoring_schema() -> dict[str, Any]:
    return {
        "status": "ok",
        "schema_version": 1,
        "initiative_types": sorted(INITIATIVE_TYPES),
        "required_review_surfaces_by_initiative": {
            name: _ordered_surfaces(surfaces)
            for name, surfaces in sorted(REQUIRED_SURFACES_BY_INITIATIVE.items())
        },
        "blocks": sorted(BLOCK_SPECS),
        "next": [
            next_command("schema requirements testing_strategy"),
            next_command("template --blocks <block> [block ...]"),
        ],
    }


def _block_schema(block: str, compact: bool = False) -> dict[str, Any]:
    spec = BLOCK_SPECS.get(block)
    if spec is None:
        raise CliFailure(
            {
                "status": "error",
                "code": "block_unknown",
                "block": block,
                "errors": [{"path": "block", "message": f"unknown block: {block}"}],
                "next": [next_command("schema"), next_command("examples")],
            }
        )
    payload = {
        "block": block,
        "title": spec.title,
        "description": spec.description,
        "category": spec.category,
        "review_area": spec.review_area,
        "kind": spec.kind,
        "fields": list(spec.fields),
        "optional_fields": sorted(ENTITY_OPTIONAL_FIELDS_BY_BLOCK.get(block, set())),
        "field_shapes": _field_shapes(block),
        "id_prefix": spec.id_prefix,
        "label_prefix": spec.label_prefix,
        "example": {block: example_block(block)},
    }
    if compact:
        return payload
    return {
        "status": "ok",
        "schema_version": 1,
        **payload,
        "next": [
            next_command("examples minimal-prd"),
            next_command("validate <prd.yaml>"),
        ],
    }


def _ordered_surfaces(surfaces: set[str]) -> list[str]:
    return (["document"] if "document" in surfaces else []) + sorted(
        surfaces - {"document"}
    )


def _field_shapes(block: str) -> dict[str, str]:
    spec = BLOCK_SPECS[block]
    if spec.kind == "summary":
        return {
            "metrics": "non-empty array of objects with label, value, and description as non-empty strings",
            "recommendation": "non-empty string",
        }
    if spec.kind == "cards":
        shapes = {field: "non-empty string" for field in spec.fields}
        optional_fields = ENTITY_OPTIONAL_FIELDS_BY_BLOCK.get(block, set())
        for field in optional_fields:
            shapes[field] = (
                "array of non-empty strings"
                if field in {"relates_to", "validates", "validation", "evidence"}
                else "non-empty string"
            )
        return shapes
    if spec.kind == "diagram":
        return {
            "description": "non-empty string",
            "source": "Mermaid flowchart string",
        }
    if spec.kind == "frames":
        return {
            **{field: "non-empty string" for field in spec.fields},
            "regions[]": "optional objects with label and detail as non-empty strings",
        }
    if spec.kind == "list":
        return {block: "non-empty array of non-empty strings"}
    if spec.kind == "questions":
        return {
            block: "non-empty array of strings or question objects",
            "question": "non-empty string",
            "id": "optional non-empty string",
            "relates_to": "array of non-empty strings",
            "evidence": "array of non-empty strings",
        }
    if spec.kind == "problem":
        return {
            "statement": "non-empty string",
            "evidence": "non-empty array of non-empty strings",
        }
    if spec.kind == "scope":
        return {
            "in": "non-empty array of non-empty strings",
            "out": "non-empty array of non-empty strings",
        }
    if spec.kind == "table":
        return {
            "columns": "non-empty array of non-empty strings",
            "rows": "non-empty array of row arrays matching columns",
        }
    if spec.kind == "code":
        return {field: "non-empty string" for field in spec.fields}
    if spec.kind == "tree":
        return {
            block: "non-empty array of design tree nodes",
            "id": "required non-empty string using the node prefix, such as NODE-01",
            "label": "required non-empty string naming the decision in a few words",
            "question": "required non-empty string holding the verbatim interview question",
            "status": "required, one of: " + ", ".join(DESIGN_TREE_STATUSES),
            "answer": "non-empty string, required for a settled node",
            "source": "required for a settled node, one of: " + ", ".join(DESIGN_TREE_SOURCES),
            "rationale": "non-empty string, required for a settled node",
            "superseded_answer": "optional non-empty string on a settled node",
            "reason": "non-empty string, required for a pruned node",
            "relates_to": "array of non-empty entity ids; a deferred node must name an open question id",
            "evidence": "array of non-empty strings; required when source is research",
            "children": "optional non-empty array of design tree nodes",
        }
    return {}


__all__ = ["command_schema"]
