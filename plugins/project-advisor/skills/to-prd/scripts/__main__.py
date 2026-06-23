"""CLI entrypoints for PRD bundle generation."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

if __package__ in {None, ""}:
    SKILL_DIR = Path(__file__).resolve().parents[1]
    if str(SKILL_DIR) not in sys.path:
        sys.path.insert(0, str(SKILL_DIR))

    from scripts.bundle import generate_bundle
    from scripts.validation import ManifestError, validate_manifest
    from scripts.yaml_manifest import YamlError, loads
else:
    from .bundle import generate_bundle
    from .validation import ManifestError, validate_manifest
    from .yaml_manifest import YamlError, loads


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate action-items/PRD-<slug>/ from a YAML PRD manifest."
    )
    parser.add_argument("manifest", type=Path, help="path to the YAML manifest")
    parser.add_argument(
        "--output-root",
        type=Path,
        default=Path("action-items"),
        help="parent directory for PRD bundles (default: ./action-items)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="replace an existing generated bundle after a successful build",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        raw_manifest = loads(args.manifest.read_text(encoding="utf-8"))
        manifest = validate_manifest(raw_manifest)
        target = generate_bundle(manifest, args.output_root, args.force)
    except YamlError as error:
        print(
            f"error: invalid YAML in {args.manifest}: line {error.line}, {error}",
            file=sys.stderr,
        )
        return 2
    except (ManifestError, FileNotFoundError, FileExistsError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    except RuntimeError as error:
        print(f"error: generator configuration failed: {error}", file=sys.stderr)
        return 3
    print(target)
    return 0


__all__ = ["main", "parse_args"]


if __name__ == "__main__":
    sys.exit(main())