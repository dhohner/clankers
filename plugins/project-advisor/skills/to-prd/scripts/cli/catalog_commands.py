"""Schema and example catalog commands for the PRD bundle CLI."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from .support import CliFailure, SKILL_DIR, display_path, next_command
from ..spec import (
    BLOCK_SPECS,
    ENTITY_OPTIONAL_FIELDS_BY_BLOCK,
    INITIATIVE_TYPES,
    REVIEW_SURFACES,
)
from ..yaml_manifest import YamlError, loads


def command_schema(args: argparse.Namespace) -> dict[str, Any]:
    blocks = list(getattr(args, "blocks", []))
    if blocks:
        if len(blocks) == 1:
            return _block_schema(blocks[0])
        return {
            "status": "ok",
            "schema_version": 1,
            "schemas": [_block_schema(block, compact=True) for block in blocks],
            "next": [next_command("examples minimal-prd"), next_command("validate <prd.yaml>")],
        }
    return {
        "status": "ok",
        "schema_version": 1,
        "initiative_types": sorted(INITIATIVE_TYPES),
        "review_surfaces": sorted(REVIEW_SURFACES),
        "blocks": [
            {
                "name": name,
                "title": spec.title,
                "kind": spec.kind,
                "fields": list(spec.fields),
            }
            for name, spec in BLOCK_SPECS.items()
        ],
        "next": [next_command("schema requirements testing_strategy"), next_command("examples minimal-prd")],
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
        "id_prefix": spec.id_prefix,
        "label_prefix": spec.label_prefix,
        "example": {block: _example_block(block)},
    }
    if compact:
        return payload
    return {
        "status": "ok",
        "schema_version": 1,
        **payload,
        "next": [next_command("examples minimal-prd"), next_command("validate <prd.yaml>")],
    }


def _example_block(block: str) -> Any:
    spec = BLOCK_SPECS[block]
    if spec.kind == "summary":
        return {
            "metrics": [
                {
                    "label": "Current",
                    "value": "Manual review",
                    "description": "Reviewers need a compact signal.",
                }
            ],
            "recommendation": "Generate a validated PRD bundle for review.",
        }
    if spec.kind == "problem":
        return {
            "statement": "Reviewers need a clear statement of the problem.",
            "evidence": ["Repository or user evidence that supports the problem."],
        }
    if spec.kind == "scope":
        return {
            "in": ["Behavior included in this PRD."],
            "out": ["Adjacent behavior intentionally excluded."],
        }
    if spec.kind == "diagram":
        return {
            "description": f"{spec.title} showing the review-relevant flow.",
            "native": {
                "nodes": [
                    {"id": "start", "label": "Start"},
                    {"id": "end", "label": "End"},
                ],
                "edges": [{"from": "start", "to": "end", "label": "Leads to"}],
            },
        }
    if spec.kind == "frames":
        return [
            {
                spec.fields[0]: f"Example {spec.fields[0].replace('_', ' ')}",
                spec.fields[1]: f"Example {spec.fields[1].replace('_', ' ')}",
                "regions": [
                    {"label": "Primary region", "detail": "Visible review content."}
                ],
            }
        ]
    if spec.kind == "table":
        return {"columns": ["From", "To"], "rows": [["Current", "Target"]]}
    if spec.kind == "questions":
        return [
            {
                "id": "QUESTION-01",
                "question": "Which decision still needs confirmation?",
            }
        ]
    if spec.kind == "list":
        return ["Outcome intentionally excluded from this PRD."]
    if spec.kind == "code":
        return [
            {
                "reference": "src/example.py",
                "language": "python",
                "code": "result = build()",
                "annotation": "Repository evidence that informs the PRD.",
            }
        ]

    item = {field: f"Example {field.replace('_', ' ')}" for field in spec.fields}
    if block == "requirements":
        item.update(
            {
                "id": "REQ-01",
                "exception": "Validation target is selected when testing scope is known.",
            }
        )
    elif block == "decisions":
        item["id"] = "DEC-01"
    elif block == "risks":
        item["id"] = "RISK-01"
    elif block == "testing_strategy":
        item["id"] = "TEST-01"
    return [item]


def command_examples(args: argparse.Namespace) -> dict[str, Any]:
    examples = [_example_item(path) for path in _example_paths()]
    if args.name:
        examples = [
            item
            for item in examples
            if args.name in {item["name"], item["path"].split("/")[-1]}
        ]
        if not examples:
            raise CliFailure(
                {
                    "status": "error",
                    "code": "example_unknown",
                    "example": args.name,
                    "errors": [
                        {"path": "example", "message": f"unknown example: {args.name}"}
                    ],
                    "next": [next_command("examples")],
                }
            )
    next_steps = (
        [
            next_command(f"validate {examples[0]['path']}"),
            next_command(f"generate {examples[0]['path']}"),
        ]
        if examples
        else []
    )
    return {"status": "ok", "examples": examples, "next": next_steps}


def _example_paths() -> list[Path]:
    examples_dir = SKILL_DIR / "examples"
    paths = sorted(examples_dir.glob("*.yaml")) + sorted(
        (SKILL_DIR / "evals" / "fixtures").glob("*.yaml")
    )
    return sorted(
        paths,
        key=lambda path: (
            path.stem != "minimal-prd",
            path.parent != examples_dir,
            path.name,
        ),
    )


def _example_item(path: Path) -> dict[str, Any]:
    item: dict[str, Any] = {"name": path.stem, "path": display_path(path)}
    try:
        raw = loads(path.read_text(encoding="utf-8"))
    except (YamlError, OSError):
        return item
    if isinstance(raw, dict):
        for field in ("title", "initiative_type"):
            if field in raw:
                item[field] = raw[field]
    return item


__all__ = ["command_examples", "command_schema"]
