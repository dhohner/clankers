"""HTML rendering package for PRD review bundles."""

from __future__ import annotations

from .document import render_document
from .helpers import category_label, category_level

__all__ = ["category_label", "category_level", "render_document"]
