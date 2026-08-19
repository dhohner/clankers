"""Direct package API for the PRD review bundle generator.

This package is the authoritative Python surface for manifest validation,
document rendering, and bundle publication. Consumers should import from this
package or run the bundled CLI from the skill root.
"""

from __future__ import annotations

from .bundle import generate_bundle
from .manifest_types import NormalizedBlocks, NormalizedManifest
from .output_validation import BundleValidationError, validate_generated_bundle
from .paths import ASSET_DIR, SCRIPT_DIR, SOURCE_DIR, TEMPLATE_PATH
from .render import (
    category_label,
    category_level,
    render_document,
    tree_mermaid_source,
)
from .spec import (
    BLOCK_SPECS,
    ENTITY_ID_PATTERN,
    GENERATED_METADATA_LABELS,
    INITIATIVE_TYPES,
    MANIFEST_FIELDS,
    REQUIRED_SURFACES_BY_INITIATIVE,
    REVIEW_SURFACES,
    SLUG_PATTERN,
    TEMPLATE_MARKER_PATTERN,
    BlockSpec,
)
from .validation import ManifestError, validate_manifest
from .yaml_manifest import _yaml_object
from .yaml_manifest import dumps as dump_yaml
from .yaml_manifest import loads as load_yaml


def parse_args(argv: list[str] | None = None):
    from .cli import parse_args as _parse_args

    return _parse_args(argv)


def main(argv: list[str] | None = None):
    from .cli import main as _main

    return _main(argv)


__all__ = [
    "ASSET_DIR",
    "BLOCK_SPECS",
    "ENTITY_ID_PATTERN",
    "GENERATED_METADATA_LABELS",
    "INITIATIVE_TYPES",
    "MANIFEST_FIELDS",
    "REQUIRED_SURFACES_BY_INITIATIVE",
    "REVIEW_SURFACES",
    "SCRIPT_DIR",
    "SLUG_PATTERN",
    "SOURCE_DIR",
    "TEMPLATE_MARKER_PATTERN",
    "TEMPLATE_PATH",
    "BlockSpec",
    "BundleValidationError",
    "ManifestError",
    "NormalizedBlocks",
    "NormalizedManifest",
    "_yaml_object",
    "category_label",
    "category_level",
    "dump_yaml",
    "generate_bundle",
    "load_yaml",
    "main",
    "parse_args",
    "render_document",
    "tree_mermaid_source",
    "validate_generated_bundle",
    "validate_manifest",
]
