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
    if args.block:
        spec = BLOCK_SPECS.get(args.block)
        if spec is None:
            raise CliFailure(
                {
                    "status": "error",
                    "code": "block_unknown",
                    "block": args.block,
                    "errors": [
                        {"path": "block", "message": f"unknown block: {args.block}"}
                    ],
                    "next": [next_command("schema"), next_command("examples")],
                }
            )
        return {
            "status": "ok",
            "schema_version": 1,
            "block": args.block,
            "title": spec.title,
            "description": spec.description,
            "category": spec.category,
            "review_area": spec.review_area,
            "kind": spec.kind,
            "fields": list(spec.fields),
            "optional_fields": sorted(
                ENTITY_OPTIONAL_FIELDS_BY_BLOCK.get(args.block, set())
            ),
            "id_prefix": spec.id_prefix,
            "label_prefix": spec.label_prefix,
            "next": [next_command("examples"), next_command("validate <prd.yaml>")],
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
        "next": [next_command("schema requirements"), next_command("examples")],
    }


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
