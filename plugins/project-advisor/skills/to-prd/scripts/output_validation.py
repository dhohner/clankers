"""Structural validation for generated PRD bundles."""

from __future__ import annotations

import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


class BundleValidationError(RuntimeError):
    """Raised when a generated bundle is incomplete or internally inconsistent."""


class _DocumentParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []
        self.fragment_links: list[str] = []
        self.local_paths: list[str] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        attributes = dict(attrs)
        if attributes.get("id"):
            self.ids.append(attributes["id"])
        for attribute in ("href", "src"):
            value = attributes.get(attribute)
            if not value:
                continue
            if value.startswith("#") and len(value) > 1:
                self.fragment_links.append(unquote(value[1:]))
                continue
            parsed = urlsplit(value)
            if not parsed.scheme and not parsed.netloc and parsed.path:
                self.local_paths.append(unquote(parsed.path))


def _resolve_local_path(bundle: Path, value: str) -> Path:
    candidate = (bundle / value).resolve()
    try:
        candidate.relative_to(bundle.resolve())
    except ValueError as error:
        raise BundleValidationError(
            f"index.html references a path outside the bundle: {value}"
        ) from error
    return candidate


def validate_generated_bundle(bundle: Path) -> None:
    """Validate required files, anchors, local assets, and preserved manifest JSON."""

    index_path = bundle / "index.html"
    manifest_path = bundle / "prd.json"
    errors: list[str] = []

    if not index_path.is_file():
        errors.append("missing index.html")
    if not manifest_path.is_file():
        errors.append("missing prd.json")
    else:
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as error:
            errors.append(f"prd.json is not readable JSON: {error}")
        else:
            for field in (
                "schema_version",
                "slug",
                "title",
                "summary",
                "status",
                "initiative_type",
                "review_surfaces",
                "metadata",
                "blocks",
            ):
                if field not in manifest:
                    errors.append(f"prd.json is missing required field: {field}")

    if index_path.is_file():
        parser = _DocumentParser()
        try:
            parser.feed(index_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError) as error:
            errors.append(f"index.html is not readable UTF-8: {error}")
        else:
            if "document-title" not in parser.ids:
                errors.append("index.html is missing required document-title ID")
            duplicates = sorted(
                identity for identity in set(parser.ids) if parser.ids.count(identity) > 1
            )
            if duplicates:
                errors.append("index.html contains duplicate IDs: " + ", ".join(duplicates))
            broken = sorted(set(parser.fragment_links) - set(parser.ids))
            if broken:
                errors.append("index.html contains broken anchors: " + ", ".join(broken))
            for local_path in sorted(set(parser.local_paths)):
                try:
                    resolved = _resolve_local_path(bundle, local_path)
                except BundleValidationError as error:
                    errors.append(str(error))
                    continue
                if not resolved.is_file():
                    errors.append(f"index.html references a missing asset: {local_path}")

    if errors:
        raise BundleValidationError("; ".join(errors))


__all__ = ["BundleValidationError", "validate_generated_bundle"]
