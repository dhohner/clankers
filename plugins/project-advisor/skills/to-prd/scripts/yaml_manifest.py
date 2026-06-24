"""Tiny YAML reader/writer for PRD manifests.

Supports the block-style subset this skill emits. JSON input is accepted as YAML.
"""

from __future__ import annotations

import json
from typing import Any


class YamlError(ValueError):
    def __init__(self, message: str, line: int = 1) -> None:
        super().__init__(message)
        self.line = line


def _yaml_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    duplicates: list[str] = []
    for key, value in pairs:
        if key in result:
            duplicates.append(key)
        result[key] = value
    if duplicates:
        raise YamlError(
            "YAML mapping contains duplicate key(s): " + ", ".join(sorted(set(duplicates)))
        )
    return result


def loads(text: str) -> Any:
    stripped = text.lstrip()
    if not stripped:
        raise YamlError("empty document")
    if stripped[0] in "[{":
        try:
            return json.loads(text, object_pairs_hook=_yaml_object)
        except json.JSONDecodeError as error:
            raise YamlError(f"column {error.colno}: {error.msg}", error.lineno) from error
    text = _expand_block_scalars(text)
    lines: list[tuple[int, int, str]] = []
    for number, raw in enumerate(text.splitlines(), 1):
        leading = raw[: len(raw) - len(raw.lstrip(" \t"))]
        if "\t" in leading:
            raise YamlError("tab indentation is not supported", number)
        if raw.strip() and not raw.lstrip().startswith("#"):
            lines.append((number, len(raw) - len(raw.lstrip(" ")), raw.strip()))
    if not lines:
        raise YamlError("empty document")
    value, index = _parse_block(lines, 0, lines[0][1])
    if index != len(lines):
        raise YamlError("unexpected content", lines[index][0])
    return value


def dumps(value: Any) -> str:
    return _dump(value, 0) + "\n"


def _expand_block_scalars(text: str) -> str:
    raw_lines = text.splitlines()
    output: list[str] = []
    index = 0
    while index < len(raw_lines):
        raw = raw_lines[index]
        stripped = raw.lstrip(" ")
        indent = len(raw) - len(stripped)
        leading = raw[: len(raw) - len(raw.lstrip(" \t"))]
        header = None if "\t" in leading or stripped.startswith("#") else _block_scalar_header(raw.strip())
        if header is None:
            output.append(raw)
            index += 1
            continue
        prefix, style, chomp = header
        block_indent = indent + 2 if prefix.startswith("- ") else indent
        block, index = _collect_block_scalar(raw_lines, index + 1, block_indent)
        value = _parse_block_scalar(block, style, chomp)
        output.append(f"{' ' * indent}{prefix} {json.dumps(value, ensure_ascii=False)}")
    return "\n".join(output) + ("\n" if text.endswith("\n") else "")


def _block_scalar_header(content: str) -> tuple[str, str, str] | None:
    if content.startswith("- "):
        item = content[2:].strip()
        mapping = _mapping_block_scalar_header(item)
        if mapping is not None:
            prefix, style, chomp = mapping
            return f"- {prefix}", style, chomp
        marker = _block_scalar_marker(item)
        if marker is not None:
            style, chomp = marker
            return "-", style, chomp
    return _mapping_block_scalar_header(content)


def _mapping_block_scalar_header(content: str) -> tuple[str, str, str] | None:
    separator = _find_key_separator(content)
    if separator == -1:
        return None
    marker = _block_scalar_marker(content[separator + 1 :].strip())
    if marker is None:
        return None
    style, chomp = marker
    return content[: separator + 1], style, chomp


def _block_scalar_marker(value: str) -> tuple[str, str] | None:
    if len(value) == 1 and value in {"|", ">"}:
        return value, ""
    if len(value) == 2 and value[0] in {"|", ">"} and value[1] in {"+", "-"}:
        return value[0], value[1]
    return None


def _collect_block_scalar(
    raw_lines: list[str], index: int, indent: int
) -> tuple[list[str], int]:
    block: list[str] = []
    content_indent: int | None = None
    while index < len(raw_lines):
        raw = raw_lines[index]
        if raw.strip() == "":
            block.append("")
            index += 1
            continue
        current_indent = len(raw) - len(raw.lstrip(" "))
        if current_indent <= indent:
            break
        content_indent = current_indent if content_indent is None else content_indent
        strip = content_indent if raw.startswith(" " * content_indent) else current_indent
        block.append(raw[strip:])
        index += 1
    return block, index


def _parse_block_scalar(lines: list[str], style: str, chomp: str) -> str:
    body = list(lines)
    if chomp in {"", "-"}:
        while body and body[-1] == "":
            body.pop()
    if not body:
        return ""
    text = _fold_block_scalar(body) if style == ">" else "\n".join(body)
    return text if chomp == "-" else f"{text}\n"


def _fold_block_scalar(lines: list[str]) -> str:
    result: list[str] = []
    paragraph: list[str] = []

    def flush() -> None:
        if paragraph:
            result.append(" ".join(paragraph))
            paragraph.clear()

    for line in lines:
        if line == "":
            flush()
            result.append("")
        else:
            paragraph.append(line)
    flush()
    return "\n".join(result)


def _parse_block(lines: list[tuple[int, int, str]], index: int, indent: int) -> tuple[Any, int]:
    if index >= len(lines):
        return {}, index
    if lines[index][1] != indent:
        raise YamlError("invalid indentation", lines[index][0])
    if lines[index][2] == "-" or lines[index][2].startswith("- "):
        return _parse_sequence(lines, index, indent)
    return _parse_mapping(lines, index, indent)


def _parse_mapping(lines: list[tuple[int, int, str]], index: int, indent: int) -> tuple[dict[str, Any], int]:
    pairs: list[tuple[str, Any]] = []
    while index < len(lines):
        line_number, current_indent, content = lines[index]
        if current_indent < indent or content == "-" or content.startswith("- "):
            break
        if current_indent != indent:
            raise YamlError("invalid indentation", line_number)
        key, value_text = _split_key_value(content, line_number)
        index += 1
        if value_text == "":
            if index < len(lines) and lines[index][1] > indent:
                value, index = _parse_block(lines, index, lines[index][1])
            else:
                value = None
        else:
            value = _parse_scalar(value_text, key, line_number)
        pairs.append((key, value))
    return _yaml_object(pairs), index


def _parse_sequence(lines: list[tuple[int, int, str]], index: int, indent: int) -> tuple[list[Any], int]:
    result: list[Any] = []
    while index < len(lines):
        line_number, current_indent, content = lines[index]
        if current_indent < indent:
            break
        if current_indent != indent or not (content == "-" or content.startswith("- ")):
            break
        item = "" if content == "-" else content[2:].strip()
        index += 1
        if item == "":
            if index < len(lines) and lines[index][1] > indent:
                value, index = _parse_block(lines, index, lines[index][1])
            else:
                value = None
        elif item.startswith(("[", "{")):
            value = _parse_scalar(item, line_number=line_number)
        elif _has_mapping_separator(item):
            key, value_text = _split_key_value(item, line_number)
            parsed_value = (
                None if value_text == "" else _parse_scalar(value_text, key, line_number)
            )
            value = _yaml_object([(key, parsed_value)])
            if value_text == "" and index < len(lines) and lines[index][1] > indent:
                value[key], index = _parse_block(lines, index, lines[index][1])
            if index < len(lines) and lines[index][1] > indent:
                extra, index = _parse_mapping(lines, index, lines[index][1])
                value = _yaml_object([*value.items(), *extra.items()])
        else:
            value = _parse_scalar(item, line_number=line_number)
        result.append(value)
    return result, index


def _has_mapping_separator(content: str) -> bool:
    separator = _find_key_separator(content)
    return separator != -1 and (
        separator == len(content) - 1 or content[separator + 1].isspace()
    )


def _find_key_separator(content: str) -> int:
    quote = ""
    escaped = False
    for index, char in enumerate(content):
        if escaped:
            escaped = False
            continue
        if quote == '"' and char == "\\":
            escaped = True
            continue
        if quote:
            if char == quote:
                quote = ""
            continue
        if char in {'"', "'"}:
            quote = char
            continue
        if char == ":":
            return index
    return -1


def _split_key_value(content: str, line_number: int) -> tuple[str, str]:
    separator = _find_key_separator(content)
    if separator == -1:
        raise YamlError("expected key: value", line_number)
    key = content[:separator].strip()
    value = content[separator + 1 :]
    if not key:
        raise YamlError("empty key", line_number)
    return _parse_key(key, line_number), value.strip()


def _parse_key(value: str, line_number: int) -> str:
    if value.startswith('"'):
        try:
            key = json.loads(value)
        except json.JSONDecodeError as error:
            raise YamlError(error.msg, line_number) from error
        if not isinstance(key, str):
            raise YamlError("key must be a string", line_number)
        return key
    if value.startswith("'"):
        return _parse_single_quoted(value, line_number)
    return value


def _parse_scalar(value: str, key: str = "", line_number: int = 1) -> Any:
    if value == "{}":
        return {}
    if value == "[]":
        return []
    if value.startswith(("[", "{")):
        return _parse_flow_collection(value, line_number)
    if value in {"null", "~"}:
        return None
    if value == "true":
        return True
    if value == "false":
        return False
    if value.startswith('"'):
        try:
            return json.loads(value)
        except json.JSONDecodeError as error:
            raise YamlError(error.msg, line_number) from error
    if value.startswith("'"):
        return _parse_single_quoted(value, line_number)
    if key == "schema_version":
        try:
            return int(value)
        except ValueError:
            return value
    return value


def _parse_flow_collection(value: str, line_number: int) -> Any:
    try:
        return json.loads(value, object_pairs_hook=_yaml_object)
    except json.JSONDecodeError as error:
        json_message = f"column {error.colno}: {error.msg}"
    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1].strip()
        if not inner:
            return []
        return [
            _parse_scalar(item, line_number=line_number)
            for item in _split_flow_items(inner, line_number)
        ]
    if value.startswith("{") and value.endswith("}"):
        inner = value[1:-1].strip()
        if not inner:
            return {}
        pairs: list[tuple[str, Any]] = []
        for item in _split_flow_items(inner, line_number):
            key, value_text = _split_key_value(item, line_number)
            parsed_value = (
                None if value_text == "" else _parse_scalar(value_text, key, line_number)
            )
            pairs.append((key, parsed_value))
        return _yaml_object(pairs)
    raise YamlError(json_message, line_number)


def _split_flow_items(value: str, line_number: int) -> list[str]:
    items: list[str] = []
    start = 0
    depth = 0
    quote = ""
    escaped = False
    for index, char in enumerate(value):
        if escaped:
            escaped = False
            continue
        if quote == '"' and char == "\\":
            escaped = True
            continue
        if quote:
            if char == quote:
                quote = ""
            continue
        if char in {'"', "'"}:
            quote = char
            continue
        if char in "[{":
            depth += 1
            continue
        if char in "]}":
            if depth == 0:
                raise YamlError("unexpected flow collection close", line_number)
            depth -= 1
            continue
        if char == "," and depth == 0:
            item = value[start:index].strip()
            if not item:
                raise YamlError("empty flow item", line_number)
            items.append(item)
            start = index + 1
    if quote:
        raise YamlError("unterminated quoted string", line_number)
    if depth:
        raise YamlError("unterminated flow collection", line_number)
    item = value[start:].strip()
    if not item:
        raise YamlError("empty flow item", line_number)
    items.append(item)
    return items


def _parse_single_quoted(value: str, line_number: int = 1) -> str:
    if len(value) < 2 or not value.endswith("'"):
        raise YamlError("unterminated single-quoted string", line_number)
    return value[1:-1].replace("''", "'")


def _dump(value: Any, indent: int) -> str:
    space = " " * indent
    if isinstance(value, dict):
        if not value:
            return f"{space}{{}}"
        lines: list[str] = []
        for key, item in value.items():
            formatted_key = _format_key(key)
            if isinstance(item, (dict, list)):
                if not item:
                    lines.append(f"{space}{formatted_key}: {_format_scalar(item)}")
                else:
                    lines.append(f"{space}{formatted_key}:")
                    lines.append(_dump(item, indent + 2))
            elif _is_block_scalar(item):
                lines.append(f"{space}{formatted_key}: {_format_block_scalar_marker(item)}")
                lines.extend(_format_block_scalar_lines(item, indent + 2))
            else:
                lines.append(f"{space}{formatted_key}: {_format_scalar(item)}")
        return "\n".join(lines)
    if isinstance(value, list):
        if not value:
            return f"{space}[]"
        lines = []
        for item in value:
            if isinstance(item, dict):
                entries = list(item.items())
                if not entries:
                    lines.append(f"{space}- {{}}")
                    continue
                key, first = entries[0]
                formatted_key = _format_key(key)
                if isinstance(first, (dict, list)):
                    if not first:
                        lines.append(f"{space}- {formatted_key}: {_format_scalar(first)}")
                    else:
                        lines.append(f"{space}- {formatted_key}:")
                        lines.append(_dump(first, indent + 4))
                elif _is_block_scalar(first):
                    lines.append(f"{space}- {formatted_key}: {_format_block_scalar_marker(first)}")
                    lines.extend(_format_block_scalar_lines(first, indent + 4))
                else:
                    lines.append(f"{space}- {formatted_key}: {_format_scalar(first)}")
                for key, rest in entries[1:]:
                    formatted_key = _format_key(key)
                    if isinstance(rest, (dict, list)):
                        if not rest:
                            lines.append(f"{space}  {formatted_key}: {_format_scalar(rest)}")
                        else:
                            lines.append(f"{space}  {formatted_key}:")
                            lines.append(_dump(rest, indent + 4))
                    elif _is_block_scalar(rest):
                        lines.append(f"{space}  {formatted_key}: {_format_block_scalar_marker(rest)}")
                        lines.extend(_format_block_scalar_lines(rest, indent + 4))
                    else:
                        lines.append(f"{space}  {formatted_key}: {_format_scalar(rest)}")
            elif isinstance(item, list):
                if not item:
                    lines.append(f"{space}- []")
                else:
                    lines.append(f"{space}-")
                    lines.append(_dump(item, indent + 2))
            elif _is_block_scalar(item):
                lines.append(f"{space}- {_format_block_scalar_marker(item)}")
                lines.extend(_format_block_scalar_lines(item, indent + 2))
            else:
                lines.append(f"{space}- {_format_scalar(item)}")
        return "\n".join(lines)
    return f"{space}{_format_scalar(value)}"


def _format_key(value: Any) -> str:
    text = str(value)
    if _needs_quotes(text):
        return json.dumps(text, ensure_ascii=False)
    return text


def _is_block_scalar(value: Any) -> bool:
    return isinstance(value, str) and "\n" in value


def _format_block_scalar_marker(value: str) -> str:
    return "|" if value.endswith("\n") else "|-"


def _format_block_scalar_lines(value: str, indent: int) -> list[str]:
    body = value[:-1] if value.endswith("\n") else value
    space = " " * indent
    return [f"{space}{line}" for line in body.split("\n")]


def _format_scalar(value: Any) -> str:
    if value == {}:
        return "{}"
    if value == []:
        return "[]"
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(value)
    text = str(value)
    if _needs_quotes(text):
        return json.dumps(text, ensure_ascii=False)
    if text in {"true", "false", "null", "~"} or _looks_numeric(text):
        return json.dumps(text, ensure_ascii=False)
    return text


def _needs_quotes(text: str) -> bool:
    return (
        "\n" in text
        or text == ""
        or text.strip() != text
        or any(c in text for c in ':#{}[]&,*?|-<>=!%@`\"')
    )


def _looks_numeric(text: str) -> bool:
    try:
        int(text)
    except ValueError:
        return False
    return True


__all__ = ["YamlError", "_yaml_object", "dumps", "loads"]
