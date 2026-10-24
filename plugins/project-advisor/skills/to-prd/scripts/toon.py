"""TOON v3.0.0 writer for JSON response values.

Follows https://github.com/toon-format/spec/tree/v3.0.0 with a comma delimiter
and a two space indent. Development oracle and provenance: tests/fixtures/toon/README.md.
"""

from __future__ import annotations

import math
import re
from collections.abc import Iterator
from decimal import Decimal
from typing import Any

INDENT = "  "
DELIMITER = ","
UNQUOTED_KEY = re.compile(r"^[A-Za-z_][A-Za-z0-9_.]*$")
NUMERIC_TEXT = re.compile(r"^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$|^0\d+$")
ESCAPES = {"\\": "\\\\", '"': '\\"', "\n": "\\n", "\r": "\\r", "\t": "\\t"}
STRUCTURAL = set(':"\\[]{}') | {DELIMITER}
SURROGATE = re.compile("[\ud800-\udfff]")

type _Lines = Iterator[str | _Lines]


def dumps(value: Any) -> str:
    """Encode a JSON value, rejecting unsupported data before constructing output."""
    _validate(value)
    if isinstance(value, dict):
        lines = _object_lines(value, 0)
    elif isinstance(value, list):
        lines = _array_lines("", value, 0)
    else:
        return _primitive(value)
    return "\n".join(_flatten_lines(lines))


def _flatten_lines(lines: _Lines) -> Iterator[str]:
    pending = [lines]
    while pending:
        chunk = next(pending[-1], None)
        if chunk is None:
            pending.pop()
        elif isinstance(chunk, str):
            yield chunk
        else:
            pending.append(chunk)


def _validate(value: Any) -> None:
    ancestors: set[int] = set()
    pending: list[tuple[int | None, Iterator[tuple[Any, str]]]] = [(None, iter(((value, "$"),)))]
    while pending:
        identity, children = pending[-1]
        child = next(children, None)
        if child is None:
            pending.pop()
            if identity is not None:
                ancestors.remove(identity)
            continue
        value, path = child
        kind = type(value)
        if value is None or kind in (bool, int):
            continue
        if kind is str:
            if SURROGATE.search(value):
                raise ValueError(
                    f"Cannot encode TOON at {path}: string contains a Unicode surrogate"
                )
            continue
        if kind is float:
            if not math.isfinite(value):
                raise ValueError(f"Cannot encode TOON at {path}: nonfinite number")
            continue
        if kind not in (dict, list):
            raise TypeError(f"Cannot encode TOON at {path}: unsupported {kind.__name__}")
        identity = id(value)
        if identity in ancestors:
            raise ValueError(f"Cannot encode TOON at {path}: circular collection")
        ancestors.add(identity)
        pending.append((identity, _validation_items(value, path)))


def _validation_items(value: dict[str, Any] | list[Any], path: str) -> Iterator[tuple[Any, str]]:
    if isinstance(value, list):
        for index, item in enumerate(value):
            yield item, f"{path}[{index}]"
        return
    for key, item in value.items():
        if type(key) is not str:
            raise TypeError(f"Cannot encode TOON at {path}: object key must be a string")
        yield key, path
        yield item, f"{path}[{key!r}]"


def _object_lines(value: dict[str, Any], depth: int) -> _Lines:
    for key, item in value.items():
        yield _field_lines(_key(key), item, depth)


def _field_lines(key: str, value: Any, depth: int, *, prefix: str | None = None) -> _Lines:
    space = INDENT * depth if prefix is None else prefix
    if isinstance(value, dict):
        yield f"{space}{key}:"
        yield _object_lines(value, depth + 1)
    elif isinstance(value, list):
        yield _array_lines(key, value, depth, prefix=space)
    else:
        yield f"{space}{key}: {_primitive(value)}"


def _array_lines(
    key: str, items: list[Any], depth: int, *, tabular: bool = True, prefix: str | None = None
) -> _Lines:
    space = INDENT * depth if prefix is None else prefix
    header = f"{key}[{len(items)}]"
    if all(_is_primitive(item) for item in items):
        row = DELIMITER.join(_primitive(item) for item in items)
        yield f"{space}{header}:" + (f" {row}" if items else "")
        return
    fields = _table_fields(items) if tabular else []
    if fields:
        yield f"{space}{header}{{{DELIMITER.join(map(_key, fields))}}}:"
        row_space = INDENT * (depth + 1)
        for item in items:
            yield row_space + DELIMITER.join(_primitive(item[field]) for field in fields)
        return
    yield f"{space}{header}:"
    for item in items:
        yield _list_item_lines(item, depth + 1)


def _table_fields(items: list[Any]) -> list[str]:
    """Return the shared field order when every item is a flat object with the same keys."""
    if not all(isinstance(item, dict) and item for item in items):
        return []
    fields = list(items[0])
    for item in items:
        if set(item) != set(fields) or not all(_is_primitive(cell) for cell in item.values()):
            return []
    return fields


def _list_item_lines(item: Any, depth: int) -> _Lines:
    space = INDENT * depth
    if isinstance(item, dict):
        if not item:
            yield f"{space}-"
            return
        fields = iter(item.items())
        key, value = next(fields)
        yield _field_lines(_key(key), value, depth + 1, prefix=f"{space}- ")
        for key, value in fields:
            yield _field_lines(_key(key), value, depth + 1)
    elif isinstance(item, list):
        yield _array_lines("", item, depth, tabular=False, prefix=f"{space}- ")
    else:
        yield f"{space}- {_primitive(item)}"


def _is_primitive(value: Any) -> bool:
    return not isinstance(value, (dict, list))


def _primitive(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        try:
            return str(value)
        except ValueError:
            return format(Decimal(value), "f")
    if isinstance(value, float):
        return _number(value)
    return _string(value)


def _number(value: float) -> str:
    if value == 0:
        return "0"
    if value.is_integer():
        return str(int(value))
    return format(Decimal(repr(value)), "f")


def _key(key: str) -> str:
    return key if UNQUOTED_KEY.fullmatch(key) else _quoted(key)


def _string(text: str) -> str:
    return _quoted(text) if _needs_quotes(text) else text


def _needs_quotes(text: str) -> bool:
    return (
        text == ""
        or text != text.strip()
        or text in {"true", "false", "null"}
        or bool(NUMERIC_TEXT.match(text))
        or text.startswith(("-", "#", "\ufeff"))
        or any(char in STRUCTURAL or char.isspace() and char != " " for char in text)
    )


def _quoted(text: str) -> str:
    return '"' + "".join(ESCAPES.get(char, char) for char in text) + '"'


__all__ = ["dumps"]
