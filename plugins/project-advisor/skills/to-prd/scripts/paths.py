"""Filesystem locations for the PRD bundle generator."""

from __future__ import annotations

from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
SOURCE_DIR = SCRIPT_DIR.parent / "bundle"
TEMPLATE_PATH = SOURCE_DIR / "index.template.html"
ASSET_DIR = SOURCE_DIR / "assets"


__all__ = ["ASSET_DIR", "SCRIPT_DIR", "SOURCE_DIR", "TEMPLATE_PATH"]