"""Independent development oracle, imported directly from the pinned upstream wheel."""

from __future__ import annotations

import sys
from pathlib import Path

WHEEL = Path(__file__).parent / "vendor" / "toon_format-1.2.0-py3-none-any.whl"


def _load_decoder():
    sys.path.insert(0, str(WHEEL))
    try:
        from toon_format import loads
    finally:
        sys.path.pop(0)
    return loads


decode = _load_decoder()
