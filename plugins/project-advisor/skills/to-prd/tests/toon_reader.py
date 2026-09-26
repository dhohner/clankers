"""Minimal TOON reader for test assertions on interview command output."""

from __future__ import annotations

TOON_ESCAPES = {"\\": "\\", '"': '"', "n": "\n", "r": "\r", "t": "\t"}


def read_toon_string(token: str) -> str:
    """Decode one TOON primitive string token with the escapes the TOON spec allows."""
    if not token.startswith('"'):
        return token
    if len(token) < 2 or not token.endswith('"'):
        raise AssertionError(f"unterminated TOON string: {token!r}")
    body = token[1:-1]
    decoded: list[str] = []
    index = 0
    while index < len(body):
        char = body[index]
        if char == '"':
            raise AssertionError(f"unescaped quote in TOON string: {token!r}")
        if char != "\\":
            decoded.append(char)
            index += 1
            continue
        escape = body[index + 1 : index + 2]
        if escape not in TOON_ESCAPES:
            raise AssertionError(f"invalid TOON escape in {token!r}")
        decoded.append(TOON_ESCAPES[escape])
        index += 2
    return "".join(decoded)


def split_toon_row(row: str) -> list[str]:
    """Split one comma delimited TOON row into decoded cells, honoring quoted cells."""
    cells: list[str] = []
    current: list[str] = []
    quoted = False
    index = 0
    while index < len(row):
        char = row[index]
        if quoted and char == "\\":
            current.append(row[index : index + 2])
            index += 2
            continue
        if char == '"':
            quoted = not quoted
        if char == "," and not quoted:
            cells.append(read_toon_string("".join(current)))
            current = []
        else:
            current.append(char)
        index += 1
    cells.append(read_toon_string("".join(current)))
    return cells


def top_level_field(output: str, key: str) -> str:
    """Return the decoded value of a top level scalar field."""
    prefix = f"{key}: "
    for line in output.splitlines():
        if line.startswith(prefix):
            return read_toon_string(line[len(prefix) :])
    raise AssertionError(f"no top level field {key!r} in:\n{output}")


def top_level_array(output: str, key: str) -> list[str]:
    """Return the decoded items of a top level inline array of scalars."""
    prefix = f"{key}["
    for line in output.splitlines():
        if line.startswith(prefix):
            header, _, values = line.partition(": ")
            count = int(header[len(prefix) : header.index("]")])
            items = split_toon_row(values) if count else []
            if len(items) != count:
                raise AssertionError(f"{key} declares {count} items, found {len(items)}")
            return items
    raise AssertionError(f"no top level array {key!r} in:\n{output}")


def top_level_table(output: str, key: str) -> list[dict[str, str]]:
    """Return the decoded rows of a top level tabular array."""
    lines = output.splitlines()
    prefix = f"{key}["
    for index, line in enumerate(lines):
        if not line.startswith(prefix) or "{" not in line:
            continue
        count = int(line[len(prefix) : line.index("]")])
        fields = line[line.index("{") + 1 : line.index("}")].split(",")
        rows = [
            split_toon_row(row.removeprefix("  ")) for row in lines[index + 1 : index + 1 + count]
        ]
        return [dict(zip(fields, row, strict=True)) for row in rows]
    raise AssertionError(f"no top level table {key!r} in:\n{output}")
