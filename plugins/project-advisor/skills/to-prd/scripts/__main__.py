"""Executable module for PRD bundle workflows."""

from __future__ import annotations

import sys
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parents[1]

if __package__ in {None, ""}:
    if str(SKILL_DIR) not in sys.path:
        sys.path.insert(0, str(SKILL_DIR))

    from scripts.cli import main, parse_args
else:
    from .cli import main, parse_args

__all__ = ["main", "parse_args"]


if __name__ == "__main__":
    sys.exit(main())
