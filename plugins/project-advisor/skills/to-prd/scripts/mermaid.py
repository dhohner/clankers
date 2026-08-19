"""Shared Mermaid source helpers.

Both manifest validation and the design tree renderer build Mermaid sources, so
label sanitizing lives here rather than in either caller.
"""

from __future__ import annotations


def mermaid_label(value: str) -> str:
    """Return label text that is safe inside a quoted Mermaid node label."""
    return " ".join(value.split()).replace('"', "'").replace("|", "/")


__all__ = ["mermaid_label"]
