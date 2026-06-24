"""CLI entrypoints for PRD bundle workflows."""

from __future__ import annotations

import argparse
import re
import shlex
import sys
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

SKILL_DIR = Path(__file__).resolve().parents[1]
GERMAN_CANDIDATE = re.compile(
    r"[äöüÄÖÜß]|\b(und|oder|nicht|für|mit|ohne|wenn|dann|ist|sind)\b",
    re.IGNORECASE,
)

if __package__ in {None, ""}:
    if str(SKILL_DIR) not in sys.path:
        sys.path.insert(0, str(SKILL_DIR))

    from scripts.bundle import generate_bundle
    from scripts.output_validation import BundleValidationError, validate_generated_bundle
    from scripts.spec import BLOCK_SPECS, ENTITY_OPTIONAL_FIELDS_BY_BLOCK, INITIATIVE_TYPES, REVIEW_SURFACES
    from scripts.validation import ManifestError, validate_manifest
    from scripts.yaml_manifest import YamlError, dumps, loads
else:
    from .bundle import generate_bundle
    from .output_validation import BundleValidationError, validate_generated_bundle
    from .spec import BLOCK_SPECS, ENTITY_OPTIONAL_FIELDS_BY_BLOCK, INITIATIVE_TYPES, REVIEW_SURFACES
    from .validation import ManifestError, validate_manifest
    from .yaml_manifest import YamlError, dumps, loads


class CliFailure(Exception):
    def __init__(self, payload: dict[str, Any], exit_code: int = 2) -> None:
        self.payload = payload
        self.exit_code = exit_code


class _IndexProbe(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []
        self.fragment_links: list[str] = []
        self.local_paths: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if attributes.get("id"):
            self.ids.append(attributes["id"])
        for attribute in ("href", "src"):
            value = attributes.get(attribute)
            if not value:
                continue
            if value.startswith("#") and len(value) > 1:
                self.fragment_links.append(value[1:])
            elif value.startswith("./"):
                self.local_paths.append(value)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="to-prd",
        description="Validate, generate, and inspect YAML PRD review bundles.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    status = subparsers.add_parser("status", help="show the workspace dashboard")
    status.add_argument("--output-root", type=Path, default=Path("action-items"))
    status.add_argument("--format", choices=("yaml", "text"), default="yaml")

    validate = subparsers.add_parser("validate", help="validate a PRD YAML manifest")
    validate.add_argument("manifest", type=Path)
    validate.add_argument("--full", action="store_true", help="show all validation detail")
    validate.add_argument("--format", choices=("yaml", "text"), default="yaml")

    generate = subparsers.add_parser("generate", help="generate a PRD bundle from YAML")
    generate.add_argument("manifest", type=Path)
    generate.add_argument("--output-root", type=Path, default=Path("action-items"))
    generate.add_argument("--force", action="store_true", help="replace an existing generated bundle")
    generate.add_argument("--format", choices=("yaml", "text"), default="yaml")

    inspect = subparsers.add_parser("inspect", help="inspect a generated PRD bundle")
    inspect.add_argument("bundle", type=Path)
    inspect.add_argument("--full", action="store_true", help="include normalized manifest and full lists")
    inspect.add_argument("--format", choices=("yaml", "text"), default="yaml")

    schema = subparsers.add_parser("schema", help="show manifest schema summary")
    schema.add_argument("block", nargs="?", help="optional block name, such as requirements")
    schema.add_argument("--format", choices=("yaml", "text"), default="yaml")

    examples = subparsers.add_parser("examples", help="list bundled example manifests")
    examples.add_argument("name", nargs="?", help="optional example name or stem")
    examples.add_argument("--format", choices=("yaml", "text"), default="yaml")

    return parser


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    raw, output_format = _extract_format(list(sys.argv[1:] if argv is None else argv))
    if not raw:
        raw = ["status"]
    return _build_parser().parse_args([*raw, *output_format])


def _extract_format(raw: list[str]) -> tuple[list[str], list[str]]:
    remaining: list[str] = []
    output_format: list[str] = []
    index = 0
    while index < len(raw):
        value = raw[index]
        if value == "--format" and index + 1 < len(raw):
            output_format = ["--format", raw[index + 1]]
            index += 2
            continue
        if value.startswith("--format="):
            output_format = ["--format", value.split("=", 1)[1]]
            index += 1
            continue
        remaining.append(value)
        index += 1
    return remaining, output_format


def _display_path(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(Path.cwd().resolve()))
    except (OSError, ValueError):
        return str(path)


def _next(command: str) -> str:
    return f"{_cli_name()} {command}"


def _cli_name() -> str:
    entrypoint = Path(sys.argv[0])
    if entrypoint.suffix == ".py":
        return f"python3 {shlex.quote(_display_path(entrypoint))}"
    return shlex.quote(_display_path(entrypoint))


def _load_manifest(path: Path, full: bool = False) -> dict[str, Any]:
    try:
        raw = loads(path.read_text(encoding="utf-8"))
    except YamlError as error:
        raise CliFailure(
            {
                "status": "error",
                "code": "yaml_invalid",
                "manifest": _display_path(path),
                "errors": [
                    {
                        "path": "manifest",
                        "message": f"line {error.line}, {error}",
                        "fix": "Repair the YAML syntax, then validate again.",
                    }
                ],
                "next": [
                    _next(f"validate {_display_path(path)}"),
                    _next("examples"),
                ],
            }
        ) from error
    except FileNotFoundError as error:
        raise CliFailure(
            {
                "status": "error",
                "code": "file_not_found",
                "manifest": _display_path(path),
                "errors": [
                    {
                        "path": "manifest",
                        "message": f"{_display_path(path)} does not exist",
                        "fix": "Pass an existing YAML manifest path.",
                    }
                ],
                "next": [_next("examples")],
            }
        ) from error
    except OSError as error:
        raise CliFailure(
            {
                "status": "error",
                "code": "manifest_unreadable",
                "manifest": _display_path(path),
                "errors": [{"path": "manifest", "message": str(error)}],
                "next": [_next(f"validate {_display_path(path)}")],
            }
        ) from error

    try:
        return validate_manifest(raw)
    except ManifestError as error:
        items = [_manifest_error_item(message) for message in error.errors]
        shown, truncated = _truncate(items, full)
        payload: dict[str, Any] = {
            "status": "error",
            "code": "manifest_invalid",
            "manifest": _display_path(path),
            "total_errors": len(items),
            "errors": shown,
            "next": [
                _next("schema requirements"),
                _next("examples api-heavy"),
            ],
        }
        if truncated:
            payload["truncated"] = True
            payload["next"].insert(0, _next(f"validate {_display_path(path)} --full"))
        raise CliFailure(payload) from error


def _manifest_error_item(message: str) -> dict[str, str]:
    item = {"path": _error_path(message), "message": message}
    fix = _fix_for(message)
    if fix:
        item["fix"] = fix
    return item


def _error_path(message: str) -> str:
    if message.startswith("duplicate entity id"):
        return "blocks"
    for marker in (" must ", " is ", " are ", " contains ", " requires ", " references "):
        if marker in message:
            path = message.split(marker, 1)[0].split()[0]
            return path.rstrip(":")
    return "manifest"


def _fix_for(message: str) -> str:
    if "must reference a TEST entity id" in message or "must connect to a validation outcome" in message:
        return "Add a matching testing_strategy item or set an explicit exception."
    if "references missing entity id" in message:
        return "Add the referenced entity or remove the reference."
    if message.startswith("schema_version"):
        return "Set schema_version: 1."
    if message.startswith("slug"):
        return "Use lowercase kebab-case."
    if "review_surfaces" in message:
        return "Include document and the initiative-specific review surface."
    if "must be a non-empty" in message:
        return "Provide the required value."
    return ""


def _truncate(items: list[Any], full: bool, limit: int = 20) -> tuple[list[Any], bool]:
    if full or len(items) <= limit:
        return items, False
    return items[:limit], True


def _summary(manifest: dict[str, Any]) -> dict[str, int]:
    blocks = manifest["blocks"]
    return {
        "blocks": len(blocks),
        "requirements": len(blocks.get("requirements", [])),
        "tests": len(blocks.get("testing_strategy", [])),
        "risks": len(blocks.get("risks", [])),
        "open_questions": len(blocks.get("open_questions", [])),
        "untranslated_german_candidates": _count_german_candidates(manifest),
        "broken_references": 0,
    }


def _count_german_candidates(value: Any) -> int:
    if isinstance(value, str):
        return int(bool(GERMAN_CANDIDATE.search(value)))
    if isinstance(value, dict):
        return sum(_count_german_candidates(item) for item in value.values())
    if isinstance(value, list):
        return sum(_count_german_candidates(item) for item in value)
    return 0


def _validation_payload(manifest: dict[str, Any], manifest_path: Path) -> dict[str, Any]:
    german_candidates = _count_german_candidates(manifest)
    warnings = []
    if german_candidates:
        warnings.append(f"review {german_candidates} possible untranslated German string(s)")
    return {
        "status": "ok",
        "manifest": _display_path(manifest_path),
        "normalized_slug": manifest["slug"],
        "review_surfaces": manifest["review_surfaces"],
        "selected_blocks": list(manifest["blocks"]),
        "missing_traceability": [],
        "summary": _summary(manifest),
        "warnings": warnings,
        "next": [
            _next(f"generate {_display_path(manifest_path)}"),
            _next("schema requirements"),
        ],
    }


def _safe_mtime(path: Path) -> float:
    try:
        return path.stat().st_mtime
    except OSError:
        return 0.0


def _command_status(args: argparse.Namespace) -> dict[str, Any]:
    root = args.output_root
    bundles = sorted(
        [path for path in root.glob("PRD-*") if path.is_dir()],
        key=_safe_mtime,
    ) if root.is_dir() else []
    latest = bundles[-1] if bundles else None
    drafts = [bundle / "prd.yaml" for bundle in bundles if (bundle / "prd.yaml").is_file()]
    next_steps = (
        [f"open {_display_path(latest / 'index.html')}", _next(f"inspect {_display_path(latest)}")]
        if latest
        else [_next("validate <prd.yaml>"), _next("generate <prd.yaml>")]
    )
    return {
        "status": "ok",
        "workspace": _display_path(Path.cwd()),
        "generator": _display_path(Path(__file__)),
        "output_root": _display_path(root),
        "bundle_count": len(bundles),
        "latest_bundle": None if latest is None else _display_path(latest),
        "existing_drafts": [_display_path(path) for path in drafts],
        "next": next_steps,
    }


def _command_validate(args: argparse.Namespace) -> dict[str, Any]:
    manifest = _load_manifest(args.manifest, args.full)
    return _validation_payload(manifest, args.manifest)


def _command_generate(args: argparse.Namespace) -> dict[str, Any]:
    manifest = _load_manifest(args.manifest)
    target = args.output_root.resolve() / f"PRD-{manifest['slug']}"
    if (target.exists() or target.is_symlink()) and not args.force:
        display_target = _display_path(target)
        raise CliFailure(
            {
                "status": "error",
                "code": "bundle_exists",
                "bundle": display_target,
                "errors": [
                    {
                        "path": "bundle",
                        "message": f"{display_target} already exists",
                        "fix": "Use --force only when replacing the bundle intentionally.",
                    }
                ],
                "next": [
                    _next(f"inspect {display_target}"),
                    _next(f"generate {_display_path(args.manifest)} --force"),
                ],
            }
        )
    try:
        bundle = generate_bundle(manifest, args.output_root, args.force)
    except FileExistsError as error:
        raise CliFailure(
            {
                "status": "error",
                "code": "bundle_exists",
                "errors": [{"path": "bundle", "message": str(error)}],
                "next": [_next(f"generate {_display_path(args.manifest)} --force")],
            }
        ) from error
    except RuntimeError as error:
        raise CliFailure(
            {
                "status": "error",
                "code": "generator_failed",
                "errors": [{"path": "bundle", "message": str(error)}],
                "next": [_next(f"validate {_display_path(args.manifest)}")],
            },
            3,
        ) from error
    except OSError as error:
        raise CliFailure(
            {
                "status": "error",
                "code": "io_error",
                "errors": [{"path": "bundle", "message": str(error)}],
                "next": [_next(f"generate {_display_path(args.manifest)}")],
            }
        ) from error

    return {
        "status": "ok",
        "bundle": _display_path(bundle),
        "files": {
            "index": _display_path(bundle / "index.html"),
            "manifest": _display_path(bundle / "prd.yaml"),
        },
        "validation": {"manifest": "ok", "bundle": "ok"},
        "summary": _summary(manifest),
        "next": [
            f"open {_display_path(bundle / 'index.html')}",
            _next(f"inspect {_display_path(bundle)}"),
        ],
    }


def _command_inspect(args: argparse.Namespace) -> dict[str, Any]:
    bundle = args.bundle
    if not bundle.exists():
        raise CliFailure(
            {
                "status": "error",
                "code": "bundle_missing",
                "bundle": _display_path(bundle),
                "errors": [
                    {
                        "path": "bundle",
                        "message": f"{_display_path(bundle)} does not exist",
                        "fix": "Generate the bundle before inspecting it.",
                    }
                ],
                "next": [_next("status"), _next("generate <prd.yaml>")],
            }
        )
    try:
        validate_generated_bundle(bundle)
        manifest = _load_manifest(bundle / "prd.yaml", args.full)
        html = (bundle / "index.html").read_text(encoding="utf-8")
    except BundleValidationError as error:
        messages = [part.strip() for part in str(error).split(";") if part.strip()]
        items, truncated = _truncate(
            [{"path": "bundle", "message": message} for message in messages],
            args.full,
        )
        payload: dict[str, Any] = {
            "status": "error",
            "code": "bundle_invalid",
            "bundle": _display_path(bundle),
            "total_errors": len(messages),
            "errors": items,
            "next": [_next(f"generate {_display_path(bundle / 'prd.yaml')} --force")],
        }
        if truncated:
            payload["truncated"] = True
            payload["next"].insert(0, _next(f"inspect {_display_path(bundle)} --full"))
        raise CliFailure(payload) from error
    except OSError as error:
        raise CliFailure(
            {
                "status": "error",
                "code": "bundle_unreadable",
                "bundle": _display_path(bundle),
                "errors": [{"path": "bundle", "message": str(error)}],
                "next": [_next("status")],
            }
        ) from error

    probe = _IndexProbe()
    probe.feed(html)
    assets = sorted(
        str(path.relative_to(bundle))
        for path in (bundle / "assets").rglob("*")
        if path.is_file()
    )
    entity_ids = _entity_ids(manifest)
    payload: dict[str, Any] = {
        "status": "ok",
        "bundle": _display_path(bundle),
        "files": {
            "index": _display_path(bundle / "index.html"),
            "manifest": _display_path(bundle / "prd.yaml"),
        },
        "sections": list(manifest["blocks"]),
        "ids": entity_ids,
        "assets": assets if args.full else assets[:20],
        "anchors": {
            "count": len(probe.ids),
            "broken": sorted(set(probe.fragment_links) - set(probe.ids)),
        },
        "traceability": _traceability_summary(manifest),
        "validation": {"manifest": "ok", "bundle": "ok"},
        "next": [
            f"open {_display_path(bundle / 'index.html')}",
            _next(f"validate {_display_path(bundle / 'prd.yaml')}"),
        ],
    }
    if not args.full and len(assets) > 20:
        payload["assets_truncated"] = True
        payload["next"].insert(0, _next(f"inspect {_display_path(bundle)} --full"))
    if args.full:
        payload["html_ids"] = probe.ids
        payload["fragment_links"] = probe.fragment_links
        payload["normalized_manifest"] = manifest
    return payload


def _entity_ids(manifest: dict[str, Any]) -> list[str]:
    ids: list[str] = []
    for block, items in manifest["blocks"].items():
        if not BLOCK_SPECS[block].id_prefix:
            continue
        ids.extend(item["id"] for item in items)
    return ids


def _traceability_summary(manifest: dict[str, Any]) -> dict[str, int]:
    blocks = manifest["blocks"]
    requirements = blocks.get("requirements", [])
    return {
        "requirements": len(requirements),
        "requirements_with_validation": sum(bool(item.get("validation")) for item in requirements),
        "requirements_with_exception": sum(bool(item.get("exception")) for item in requirements),
        "validation_links": sum(len(item.get("validation", [])) for item in requirements),
    }


def _command_schema(args: argparse.Namespace) -> dict[str, Any]:
    if args.block:
        spec = BLOCK_SPECS.get(args.block)
        if spec is None:
            raise CliFailure(
                {
                    "status": "error",
                    "code": "block_unknown",
                    "block": args.block,
                    "errors": [{"path": "block", "message": f"unknown block: {args.block}"}],
                    "next": [_next("schema"), _next("examples")],
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
            "optional_fields": sorted(ENTITY_OPTIONAL_FIELDS_BY_BLOCK.get(args.block, set())),
            "id_prefix": spec.id_prefix,
            "label_prefix": spec.label_prefix,
            "next": [_next("examples"), _next("validate <prd.yaml>")],
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
        "next": [_next("schema requirements"), _next("examples")],
    }


def _example_paths() -> list[Path]:
    return sorted((SKILL_DIR / "examples").glob("*.yaml")) + sorted((SKILL_DIR / "evals" / "fixtures").glob("*.yaml"))


def _command_examples(args: argparse.Namespace) -> dict[str, Any]:
    examples = [_example_item(path) for path in _example_paths()]
    if args.name:
        matches = [item for item in examples if args.name in {item["name"], item["path"].split("/")[-1]}]
        if not matches:
            raise CliFailure(
                {
                    "status": "error",
                    "code": "example_unknown",
                    "example": args.name,
                    "errors": [{"path": "example", "message": f"unknown example: {args.name}"}],
                    "next": [_next("examples")],
                }
            )
        examples = matches
    next_steps = (
        [_next(f"validate {examples[0]['path']}"), _next(f"generate {examples[0]['path']}")]
        if examples
        else []
    )
    return {"status": "ok", "examples": examples, "next": next_steps}


def _example_item(path: Path) -> dict[str, Any]:
    item: dict[str, Any] = {"name": path.stem, "path": _display_path(path)}
    try:
        raw = loads(path.read_text(encoding="utf-8"))
    except (YamlError, OSError):
        return item
    if isinstance(raw, dict):
        for field in ("title", "initiative_type"):
            if field in raw:
                item[field] = raw[field]
    return item


def _run(args: argparse.Namespace) -> dict[str, Any]:
    if args.command == "status":
        return _command_status(args)
    if args.command == "validate":
        return _command_validate(args)
    if args.command == "generate":
        return _command_generate(args)
    if args.command == "inspect":
        return _command_inspect(args)
    if args.command == "schema":
        return _command_schema(args)
    if args.command == "examples":
        return _command_examples(args)
    raise RuntimeError(f"unsupported command: {args.command}")


def _emit(payload: dict[str, Any], output_format: str) -> None:
    if output_format == "yaml":
        print(dumps(payload).rstrip())
        return
    print(_text(payload))


def _text(value: Any, indent: int = 0) -> str:
    space = "  " * indent
    if isinstance(value, dict):
        lines: list[str] = []
        for key, item in value.items():
            if isinstance(item, (dict, list)):
                lines.append(f"{space}{key}:")
                lines.append(_text(item, indent + 1))
            else:
                lines.append(f"{space}{key}: {item}")
        return "\n".join(lines)
    if isinstance(value, list):
        if not value:
            return f"{space}(none)"
        lines = []
        for item in value:
            if isinstance(item, (dict, list)):
                lines.append(f"{space}-")
                lines.append(_text(item, indent + 1))
            else:
                lines.append(f"{space}- {item}")
        return "\n".join(lines)
    return f"{space}{value}"


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        payload = _run(args)
        exit_code = 0
    except CliFailure as error:
        payload = error.payload
        exit_code = error.exit_code
    _emit(payload, args.format)
    return exit_code


__all__ = ["main", "parse_args"]


if __name__ == "__main__":
    sys.exit(main())
