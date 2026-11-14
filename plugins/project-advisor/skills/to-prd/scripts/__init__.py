"""Direct package API for the PRD review bundle generator.

This package is the authoritative Python surface for manifest validation,
document rendering, and bundle publication. Consumers should import from this
package or run the bundled CLI from the skill root.
"""

from __future__ import annotations

import sys

# This check runs before any submodule is compiled, because the submodules use syntax
# that an older interpreter rejects with a bare SyntaxError. Keep this file parseable
# by Python 3.9, the oldest python3 still common on macOS.
MINIMUM_PYTHON = (3, 14)
if sys.version_info < MINIMUM_PYTHON:
    _found = ".".join(str(part) for part in sys.version_info[:3])
    _needed = ".".join(str(part) for part in MINIMUM_PYTHON)
    _entrypoint = __file__.rsplit("__init__.py", 1)[0] + "__main__.py"
    sys.stderr.write(
        f"to-prd needs Python {_needed} or newer, but {sys.executable} is Python {_found}.\n"
        f"Run the CLI with a newer interpreter, for example:\n"
        f"  uv run --no-project --python {_needed} python {_entrypoint} <command>\n"
    )
    raise SystemExit(2)

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
    CURRENT_SCHEMA_VERSION,
    ENTITY_ID_PATTERN,
    GENERATED_METADATA_LABELS,
    INITIATIVE_TYPES,
    MANIFEST_FIELDS,
    REQUIRED_SURFACES_BY_INITIATIVE,
    REVIEW_SURFACES,
    SCHEMA_VERSIONS,
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
    "CURRENT_SCHEMA_VERSION",
    "ENTITY_ID_PATTERN",
    "GENERATED_METADATA_LABELS",
    "INITIATIVE_TYPES",
    "MANIFEST_FIELDS",
    "REQUIRED_SURFACES_BY_INITIATIVE",
    "REVIEW_SURFACES",
    "SCHEMA_VERSIONS",
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
