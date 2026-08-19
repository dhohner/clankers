"""Template catalog command for the PRD bundle CLI."""

from __future__ import annotations

import argparse
from typing import Any

from ..spec import BLOCK_SPECS, CURRENT_SCHEMA_VERSION
from ..validation import ManifestError, validate_manifest
from .catalog_blocks import template_block
from .support import CliFailure, next_command


def command_template(args: argparse.Namespace) -> dict[str, Any]:
    block_names = list(dict.fromkeys(getattr(args, "blocks", [])))
    unknown_blocks = sorted(set(block_names) - set(BLOCK_SPECS))
    if unknown_blocks:
        raise CliFailure(
            {
                "status": "error",
                "code": "block_unknown",
                "blocks": unknown_blocks,
                "errors": [
                    {
                        "path": "blocks",
                        "message": "unknown block(s): " + ", ".join(unknown_blocks),
                    }
                ],
                "next": [
                    next_command("schema"),
                    next_command(
                        "template --blocks goals requirements testing_strategy"
                    ),
                ],
            }
        )

    blocks = {
        block: template_block(block)
        for block in _with_required_blocks(block_names)
    }
    _link_template_traceability(blocks)
    manifest = {
        "schema_version": CURRENT_SCHEMA_VERSION,
        "slug": "draft-prd",
        "title": "Replace with PRD title",
        "summary": "Replace with one-sentence product summary.",
        "status": "Draft for review",
        "initiative_type": "small-feature",
        "review_surfaces": ["document"],
        "metadata": {"Owner": "Replace with owner"},
        "blocks": blocks,
    }
    try:
        validate_manifest(manifest)
    except ManifestError as error:
        raise CliFailure(
            {
                "status": "error",
                "code": "template_invalid",
                "errors": [
                    {"path": "template", "message": message}
                    for message in error.errors
                ],
                "next": [next_command("schema")],
            }
        ) from error
    return manifest


def _with_required_blocks(block_names: list[str]) -> list[str]:
    """Return the selected blocks plus the design tree the current version needs.

    The template must validate unchanged, so a missing required block joins the
    selection at its canonical position rather than waiting for the author.
    """
    if "design_tree" in block_names:
        return block_names
    order = list(BLOCK_SPECS)
    position = order.index("design_tree")
    for index, name in enumerate(block_names):
        if order.index(name) > position:
            return [*block_names[:index], "design_tree", *block_names[index:]]
    return [*block_names, "design_tree"]


def _link_template_traceability(blocks: dict[str, Any]) -> None:
    if "requirements" not in blocks or "testing_strategy" not in blocks:
        return
    blocks["requirements"][0].pop("exception", None)
    blocks["requirements"][0]["validation"] = ["TEST-01"]
    blocks["testing_strategy"][0]["validates"] = ["REQ-01"]


__all__ = ["command_template"]
