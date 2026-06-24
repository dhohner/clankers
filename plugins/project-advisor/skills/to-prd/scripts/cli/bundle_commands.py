"""Bundle lifecycle commands for the PRD bundle CLI."""

from __future__ import annotations

import argparse
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

from ..bundle import generate_bundle
from ..output_validation import BundleValidationError, validate_generated_bundle
from ..spec import BLOCK_SPECS
from .support import (
    CliFailure,
    ENTRYPOINT,
    display_path,
    load_manifest,
    next_command,
    summary,
    truncate,
)


class _IndexProbe(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []
        self.fragment_links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if attributes.get("id"):
            self.ids.append(attributes["id"])
        for attribute in ("href", "src"):
            value = attributes.get(attribute)
            if value and value.startswith("#") and len(value) > 1:
                self.fragment_links.append(value[1:])


def command_status(args: argparse.Namespace) -> dict[str, Any]:
    root = args.output_root
    bundles = (
        sorted(
            [path for path in root.glob("PRD-*") if path.is_dir()],
            key=_safe_mtime,
        )
        if root.is_dir()
        else []
    )
    latest = bundles[-1] if bundles else None
    drafts = [bundle / "prd.yaml" for bundle in bundles if (bundle / "prd.yaml").is_file()]
    next_steps = (
        [
            f"open {display_path(latest / 'index.html')}",
            next_command(f"inspect {display_path(latest)}"),
        ]
        if latest
        else [next_command("validate <prd.yaml>"), next_command("generate <prd.yaml>")]
    )
    return {
        "status": "ok",
        "workspace": display_path(Path.cwd()),
        "generator": display_path(ENTRYPOINT),
        "output_root": display_path(root),
        "bundle_count": len(bundles),
        "latest_bundle": None if latest is None else display_path(latest),
        "existing_drafts": [display_path(path) for path in drafts],
        "next": next_steps,
    }


def command_generate(args: argparse.Namespace) -> dict[str, Any]:
    manifest = load_manifest(args.manifest)
    target = args.output_root.resolve() / f"PRD-{manifest['slug']}"
    if (target.exists() or target.is_symlink()) and not args.force:
        display_target = display_path(target)
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
                    next_command(f"inspect {display_target}"),
                    next_command(f"generate {display_path(args.manifest)} --force"),
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
                "next": [
                    next_command(f"generate {display_path(args.manifest)} --force")
                ],
            }
        ) from error
    except RuntimeError as error:
        raise CliFailure(
            {
                "status": "error",
                "code": "generator_failed",
                "errors": [{"path": "bundle", "message": str(error)}],
                "next": [next_command(f"validate {display_path(args.manifest)}")],
            },
            3,
        ) from error
    except OSError as error:
        raise CliFailure(
            {
                "status": "error",
                "code": "io_error",
                "errors": [{"path": "bundle", "message": str(error)}],
                "next": [next_command(f"generate {display_path(args.manifest)}")],
            }
        ) from error

    return {
        "status": "ok",
        "bundle": display_path(bundle),
        "files": {
            "index": display_path(bundle / "index.html"),
            "manifest": display_path(bundle / "prd.yaml"),
        },
        "validation": {"manifest": "ok", "bundle": "ok"},
        "summary": summary(manifest),
        "next": [
            f"open {display_path(bundle / 'index.html')}",
            next_command(f"inspect {display_path(bundle)}"),
        ],
    }


def command_inspect(args: argparse.Namespace) -> dict[str, Any]:
    bundle = args.bundle
    if not bundle.exists():
        raise CliFailure(
            {
                "status": "error",
                "code": "bundle_missing",
                "bundle": display_path(bundle),
                "errors": [
                    {
                        "path": "bundle",
                        "message": f"{display_path(bundle)} does not exist",
                        "fix": "Generate the bundle before inspecting it.",
                    }
                ],
                "next": [next_command("status"), next_command("generate <prd.yaml>")],
            }
        )
    try:
        validate_generated_bundle(bundle)
        manifest = load_manifest(bundle / "prd.yaml", args.full)
        html = (bundle / "index.html").read_text(encoding="utf-8")
    except BundleValidationError as error:
        messages = [part.strip() for part in str(error).split(";") if part.strip()]
        items, truncated = truncate(
            [{"path": "bundle", "message": message} for message in messages],
            args.full,
        )
        payload: dict[str, Any] = {
            "status": "error",
            "code": "bundle_invalid",
            "bundle": display_path(bundle),
            "total_errors": len(messages),
            "errors": items,
            "next": [
                next_command(f"generate {display_path(bundle / 'prd.yaml')} --force")
            ],
        }
        if truncated:
            payload["truncated"] = True
            payload["next"].insert(
                0,
                next_command(f"inspect {display_path(bundle)} --full"),
            )
        raise CliFailure(payload) from error
    except OSError as error:
        raise CliFailure(
            {
                "status": "error",
                "code": "bundle_unreadable",
                "bundle": display_path(bundle),
                "errors": [{"path": "bundle", "message": str(error)}],
                "next": [next_command("status")],
            }
        ) from error

    probe = _IndexProbe()
    probe.feed(html)
    assets = sorted(
        str(path.relative_to(bundle))
        for path in (bundle / "assets").rglob("*")
        if path.is_file()
    )
    payload: dict[str, Any] = {
        "status": "ok",
        "bundle": display_path(bundle),
        "files": {
            "index": display_path(bundle / "index.html"),
            "manifest": display_path(bundle / "prd.yaml"),
        },
        "sections": list(manifest["blocks"]),
        "ids": _entity_ids(manifest),
        "assets": assets if args.full else assets[:20],
        "anchors": {
            "count": len(probe.ids),
            "broken": sorted(set(probe.fragment_links) - set(probe.ids)),
        },
        "traceability": _traceability_summary(manifest),
        "validation": {"manifest": "ok", "bundle": "ok"},
        "next": [
            f"open {display_path(bundle / 'index.html')}",
            next_command(f"validate {display_path(bundle / 'prd.yaml')}"),
        ],
    }
    if not args.full and len(assets) > 20:
        payload["assets_truncated"] = True
        payload["next"].insert(
            0,
            next_command(f"inspect {display_path(bundle)} --full"),
        )
    if args.full:
        payload["html_ids"] = probe.ids
        payload["fragment_links"] = probe.fragment_links
        payload["normalized_manifest"] = manifest
    return payload


def _safe_mtime(path: Path) -> float:
    try:
        return path.stat().st_mtime
    except OSError:
        return 0.0


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
        "requirements_with_validation": sum(
            bool(item.get("validation")) for item in requirements
        ),
        "requirements_with_exception": sum(
            bool(item.get("exception")) for item in requirements
        ),
        "validation_links": sum(len(item.get("validation", [])) for item in requirements),
    }


__all__ = ["command_generate", "command_inspect", "command_status"]
