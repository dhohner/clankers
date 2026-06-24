"""CLI argument parsing and execution for PRD bundle workflows."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

from .commands import COMMANDS
from .support import CliFailure
from ..yaml_manifest import dumps


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
    validate.add_argument(
        "--full",
        action="store_true",
        help="show all validation detail",
    )
    validate.add_argument("--format", choices=("yaml", "text"), default="yaml")

    generate = subparsers.add_parser("generate", help="generate a PRD bundle from YAML")
    generate.add_argument("manifest", type=Path)
    generate.add_argument("--output-root", type=Path, default=Path("action-items"))
    generate.add_argument(
        "--force",
        action="store_true",
        help="replace an existing generated bundle",
    )
    generate.add_argument("--format", choices=("yaml", "text"), default="yaml")

    inspect = subparsers.add_parser("inspect", help="inspect a generated PRD bundle")
    inspect.add_argument("bundle", type=Path)
    inspect.add_argument(
        "--full",
        action="store_true",
        help="include normalized manifest and full lists",
    )
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


def _run(args: argparse.Namespace) -> dict[str, Any]:
    command = COMMANDS.get(args.command)
    if command is None:
        raise RuntimeError(f"unsupported command: {args.command}")
    return command(args)


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
