"""Flatten canonical local stylesheets for dependency-free bundle exports."""

from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urlsplit

# Keep strings, comments and escapes intact while handling the canonical CSS's
# quoted imports/URLs. Whitespace compaction leaves selector and calc() spaces.
CSS_TOKENS = re.compile(
    r'/\*.*?\*/|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\''
    r'|@import\s+url\("[^"\n]+"\);|url\("[^"\n]+"\)'
    r"|\\.|[ \t\r\n\f]+|.",
    re.DOTALL,
)


def minify_css(styles: str) -> str:
    """Compact whitespace without rewriting CSS values, strings or comments."""
    tokens = CSS_TOKENS.findall(styles)
    result: list[str] = []
    for index, token in enumerate(tokens):
        if token.isspace():
            previous = tokens[index - 1] if index else ""
            following = tokens[index + 1] if index + 1 < len(tokens) else ""
            if not previous or not following or previous in "{};," or following in "{};,":
                continue
            token = " "
        result.append(token)
    return "".join(result)


def compile_stylesheet(source: Path, asset_root: Path) -> str:
    """Inline local imports in cascade order and rebase URLs to the asset root."""
    asset_root = asset_root.resolve()

    def local_path(parent: Path, reference: str) -> Path:
        path = (parent / reference).resolve()
        if not path.is_relative_to(asset_root):
            raise ValueError(f"CSS asset is outside the asset directory: {reference}")
        return path

    def flatten(path: Path, ancestors: tuple[Path, ...] = ()) -> str:
        path = path.resolve()
        if path in ancestors:
            raise ValueError(f"Circular CSS import: {path}")
        parts: list[str] = []
        for token in CSS_TOKENS.findall(path.read_text(encoding="utf-8")):
            if token.startswith("@import"):
                reference = token.split('"')[1]
                if urlsplit(reference).scheme or reference.startswith(("/", "#")):
                    raise ValueError(f"CSS imports must be local assets: {reference}")
                imported = local_path(path.parent, reference)
                token = flatten(imported, (*ancestors, path))
            elif token.startswith('url("'):
                reference = token[5:-2]
                parsed = urlsplit(reference)
                if not parsed.scheme and not reference.startswith(("/", "#")):
                    target = local_path(path.parent, parsed.path)
                    rebased = "./" + target.relative_to(asset_root).as_posix()
                    if parsed.query:
                        rebased += "?" + parsed.query
                    if parsed.fragment:
                        rebased += "#" + parsed.fragment
                    token = f'url("{rebased}")'
            parts.append(token)
        return "".join(parts)

    return minify_css(flatten(source)) + "\n"
