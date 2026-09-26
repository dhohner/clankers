"""TOON writer for the interview commands.

Follows the TOON encoding rules at https://github.com/toon-format/spec with a comma
delimiter and a two space indent.
"""

from __future__ import annotations

import math
import re
from decimal import Decimal
from typing import Any

INDENT = "  "
DELIMITER = ","
UNQUOTED_KEY = re.compile(r"^[A-Za-z_][A-Za-z0-9_.]*$")
NUMERIC_TEXT = re.compile(r"^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$|^0\d+$")
ESCAPES = {"\\": "\\\\", '"': '\\"', "\n": "\\n", "\r": "\\r", "\t": "\\t"}
STRUCTURAL = set(':"\\[]{}') | {DELIMITER}


def dumps(value: dict[str, Any]) -> str:
    return "\n".join(_object_lines(value, 0))


def _object_lines(value: dict[str, Any], depth: int) -> list[str]:
    lines: list[str] = []
    for key, item in value.items():
        lines.extend(_field_lines(_key(key), item, depth))
    return lines


def _field_lines(key: str, value: Any, depth: int) -> list[str]:
    space = INDENT * depth
    if isinstance(value, dict):
        return [f"{space}{key}:", *_object_lines(value, depth + 1)]
    if isinstance(value, list):
        return _array_lines(key, value, depth)
    return [f"{space}{key}: {_primitive(value)}"]


def _array_lines(key: str, items: list[Any], depth: int) -> list[str]:
    space = INDENT * depth
    header = f"{key}[{len(items)}]"
    if all(_is_primitive(item) for item in items):
        row = DELIMITER.join(_primitive(item) for item in items)
        return [f"{space}{header}:" + (f" {row}" if items else "")]
    fields = _table_fields(items)
    if fields:
        row_space = INDENT * (depth + 1)
        rows = [
            row_space + DELIMITER.join(_primitive(item[field]) for field in fields)
            for item in items
        ]
        return [f"{space}{header}{{{DELIMITER.join(map(_key, fields))}}}:", *rows]
    lines = [f"{space}{header}:"]
    for item in items:
        lines.extend(_list_item_lines(item, depth + 1))
    return lines


def _table_fields(items: list[Any]) -> list[str]:
    """Return the shared field order when every item is a flat object with the same keys."""
    if not all(isinstance(item, dict) and item for item in items):
        return []
    fields = list(items[0])
    for item in items:
        if set(item) != set(fields) or not all(_is_primitive(cell) for cell in item.values()):
            return []
    return fields


def _list_item_lines(item: Any, depth: int) -> list[str]:
    space = INDENT * depth
    if isinstance(item, dict):
        if not item:
            return [f"{space}-"]
        lines = _object_lines(item, depth + 1)
        return [f"{space}- {lines[0].lstrip()}", *lines[1:]]
    if isinstance(item, list):
        lines = _array_lines("", item, depth)
        return [f"{space}- {lines[0].lstrip()}", *lines[1:]]
    return [f"{space}- {_primitive(item)}"]


def _is_primitive(value: Any) -> bool:
    return not isinstance(value, (dict, list))


def _primitive(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return _number(value)
    return _string(str(value))


def _number(value: float) -> str:
    if not math.isfinite(value):
        return "null"
    if value == 0:
        return "0"
    if value.is_integer():
        return str(int(value))
    return format(Decimal(repr(value)), "f")


def _key(key: Any) -> str:
    text = str(key)
    return text if UNQUOTED_KEY.match(text) else _quoted(text)


def _string(text: str) -> str:
    return _quoted(text) if _needs_quotes(text) else text


def _needs_quotes(text: str) -> bool:
    return (
        text == ""
        or text != text.strip()
        or text in {"true", "false", "null"}
        or bool(NUMERIC_TEXT.match(text))
        or text.startswith("-")
        or any(char in STRUCTURAL or char.isspace() and char != " " for char in text)
    )


def _quoted(text: str) -> str:
    return '"' + "".join(ESCAPES.get(char, char) for char in text) + '"'


__all__ = ["dumps"]
