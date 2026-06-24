"""Shared helpers for the PRD bundle CLI."""

from __future__ import annotations

import re
import shlex
import sys
from pathlib import Path
from typing import Any

from ..validation import ManifestError, validate_manifest
from ..yaml_manifest import YamlError, loads

SKILL_DIR = Path(__file__).resolve().parents[2]
ENTRYPOINT = SKILL_DIR / "scripts" / "__main__.py"
GERMAN_CANDIDATE = re.compile(
    r"[äöüÄÖÜß]|\b(und|oder|nicht|für|mit|ohne|wenn|dann|ist|sind)\b",
    re.IGNORECASE,
)


class CliFailure(Exception):
    def __init__(self, payload: dict[str, Any], exit_code: int = 2) -> None:
        self.payload = payload
        self.exit_code = exit_code


def display_path(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(Path.cwd().resolve()))
    except (OSError, ValueError):
        return str(path)


def next_command(command: str) -> str:
    return f"{_cli_name()} {command}"


def _cli_name() -> str:
    entrypoint = Path(sys.argv[0])
    if entrypoint.suffix == ".py":
        return f"python3 {shlex.quote(display_path(entrypoint))}"
    return shlex.quote(display_path(entrypoint))


def load_manifest(path: Path, full: bool = False) -> dict[str, Any]:
    try:
        raw = loads(path.read_text(encoding="utf-8"))
    except YamlError as error:
        raise CliFailure(
            {
                "status": "error",
                "code": "yaml_invalid",
                "manifest": display_path(path),
                "errors": [
                    {
                        "path": "manifest",
                        "message": f"line {error.line}, {error}",
                        "fix": "Repair the YAML syntax, then validate again.",
                    }
                ],
                "next": [
                    next_command(f"validate {display_path(path)}"),
                    next_command("examples"),
                ],
            }
        ) from error
    except FileNotFoundError as error:
        raise CliFailure(
            {
                "status": "error",
                "code": "file_not_found",
                "manifest": display_path(path),
                "errors": [
                    {
                        "path": "manifest",
                        "message": f"{display_path(path)} does not exist",
                        "fix": "Pass an existing YAML manifest path.",
                    }
                ],
                "next": [next_command("examples")],
            }
        ) from error
    except OSError as error:
        raise CliFailure(
            {
                "status": "error",
                "code": "manifest_unreadable",
                "manifest": display_path(path),
                "errors": [{"path": "manifest", "message": str(error)}],
                "next": [next_command(f"validate {display_path(path)}")],
            }
        ) from error

    try:
        return validate_manifest(raw)
    except ManifestError as error:
        items = [_manifest_error_item(message) for message in error.errors]
        shown, truncated = truncate(items, full)
        payload: dict[str, Any] = {
            "status": "error",
            "code": "manifest_invalid",
            "manifest": display_path(path),
            "total_errors": len(items),
            "errors": shown,
            "next": [
                next_command("schema requirements"),
                next_command("examples api-heavy"),
            ],
        }
        if truncated:
            payload["truncated"] = True
            payload["next"].insert(
                0,
                next_command(f"validate {display_path(path)} --full"),
            )
        raise CliFailure(payload) from error


def validation_payload(manifest: dict[str, Any], manifest_path: Path) -> dict[str, Any]:
    german_candidates = _count_german_candidates(manifest)
    warnings = []
    if german_candidates:
        warnings.append(
            f"review {german_candidates} possible untranslated German string(s)"
        )
    return {
        "status": "ok",
        "manifest": display_path(manifest_path),
        "normalized_slug": manifest["slug"],
        "review_surfaces": manifest["review_surfaces"],
        "selected_blocks": list(manifest["blocks"]),
        "missing_traceability": [],
        "summary": summary(manifest),
        "warnings": warnings,
        "next": [
            next_command(f"generate {display_path(manifest_path)}"),
            next_command("schema requirements"),
        ],
    }


def summary(manifest: dict[str, Any]) -> dict[str, int]:
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


def truncate(items: list[Any], full: bool, limit: int = 20) -> tuple[list[Any], bool]:
    if full or len(items) <= limit:
        return items, False
    return items[:limit], True


def _manifest_error_item(message: str) -> dict[str, str]:
    item = {"path": _error_path(message), "message": message}
    fix = _fix_for(message)
    if fix:
        item["fix"] = fix
    return item


def _error_path(message: str) -> str:
    if message.startswith("duplicate entity id"):
        return "blocks"
    markers = (" must ", " is ", " are ", " contains ", " requires ", " references ")
    for marker in markers:
        if marker in message:
            path = message.split(marker, 1)[0].split()[0]
            return path.rstrip(":")
    return "manifest"


def _fix_for(message: str) -> str:
    if (
        "must reference a TEST entity id" in message
        or "must connect to a validation outcome" in message
    ):
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


def _count_german_candidates(value: Any) -> int:
    if isinstance(value, str):
        return int(bool(GERMAN_CANDIDATE.search(value)))
    if isinstance(value, dict):
        return sum(_count_german_candidates(item) for item in value.values())
    if isinstance(value, list):
        return sum(_count_german_candidates(item) for item in value)
    return 0


__all__ = [
    "CliFailure",
    "ENTRYPOINT",
    "SKILL_DIR",
    "display_path",
    "load_manifest",
    "next_command",
    "summary",
    "truncate",
    "validation_payload",
]
