"""Direct package API for the PRD review bundle generator.

This package is the authoritative Python surface for manifest validation,
document rendering, and bundle publication. Consumers should import from this
package or run the bundled CLI from the skill root.
"""

from __future__ import annotations

from .bundle import generate_bundle
from .paths import ASSET_DIR, SCRIPT_DIR, SOURCE_DIR, TEMPLATE_PATH
from .rendering import render_document
from .spec import (
    BLOCK_SPECS,
    ENTITY_ID_PATTERN,
    GENERATED_METADATA_LABELS,
    INITIATIVE_TYPES,
    MANIFEST_FIELDS,
    REVIEW_SURFACES,
    SLUG_PATTERN,
    TEMPLATE_MARKER_PATTERN,
    BlockSpec,
)
from .types import NormalizedBlocks, NormalizedManifest
from .validation import ManifestError, _json_object, validate_manifest


def parse_args(argv: list[str] | None = None):
    from .__main__ import parse_args as _parse_args

    return _parse_args(argv)


def main(argv: list[str] | None = None):
    from .__main__ import main as _main

    return _main(argv)


__all__ = [
    "ASSET_DIR",
    "BLOCK_SPECS",
    "ENTITY_ID_PATTERN",
    "GENERATED_METADATA_LABELS",
    "INITIATIVE_TYPES",
    "MANIFEST_FIELDS",
    "ManifestError",
    "NormalizedBlocks",
    "NormalizedManifest",
    "REVIEW_SURFACES",
    "SCRIPT_DIR",
    "SLUG_PATTERN",
    "SOURCE_DIR",
    "TEMPLATE_MARKER_PATTERN",
    "TEMPLATE_PATH",
    "BlockSpec",
    "_json_object",
    "generate_bundle",
    "main",
    "parse_args",
    "render_document",
    "validate_manifest",
]