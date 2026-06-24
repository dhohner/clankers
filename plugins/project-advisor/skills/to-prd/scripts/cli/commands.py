"""Command dispatch table for the PRD bundle CLI."""

from __future__ import annotations

import argparse
from typing import Any, Callable

from .bundle_commands import command_generate, command_inspect, command_status
from .catalog_commands import command_examples, command_schema
from .support import load_manifest, validation_payload


def command_validate(args: argparse.Namespace) -> dict[str, Any]:
    manifest = load_manifest(args.manifest, args.full)
    return validation_payload(manifest, args.manifest)


COMMANDS: dict[str, Callable[[argparse.Namespace], dict[str, Any]]] = {
    "status": command_status,
    "validate": command_validate,
    "generate": command_generate,
    "inspect": command_inspect,
    "schema": command_schema,
    "examples": command_examples,
}

__all__ = ["COMMANDS", "command_validate"]
