"""Advisory manifest checks that `validate` and `inspect` report as warnings.

The checks are heuristics, so they never fail validation: a sentence-length check for the
ASD-STE100 prose rule, and an existence check for the evidence of research answers.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from .manifest_types import NormalizedManifest
from .spec import iter_tree_nodes, tree_blocks

MAX_SENTENCE_WORDS = 20
# Fields that hold identifiers, references, code, or diagram source rather than prose.
NON_PROSE_FIELDS = frozenset(
    {
        "code",
        "evidence",
        "id",
        "label",
        "language",
        "reference",
        "relates_to",
        "schema_version",
        "slug",
        "source",
        "validates",
        "validation",
    }
)
SENTENCE_END = re.compile(r"(?<=[.!?])\s+")
URL = re.compile(r"^https?://\S+$")
# A location suffix such as `:42`, `:42-50`, `#L42`, or `::symbol` after a path.
LOCATION_SUFFIX = re.compile(r"(?:::[\w.]+|:\d+(?:[-:]\d+)?|#L\d+(?:-L?\d+)?)$")
# A bare name counts as a file only when its extension has a letter, so `3.14` does not.
FILE_NAME = re.compile(r"^[\w.-]*\w\.(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{1,8}$")
# Dotted single letters such as `e.g` and `i.e` are abbreviations, not file names.
ABBREVIATION = re.compile(r"^(?:[A-Za-z]\.)+[A-Za-z]$")
TOKEN_PUNCTUATION = "`'\"()[]{}<>,;"
PREVIEW_WORDS = 8


def manifest_warnings(manifest: NormalizedManifest, workspace: Path) -> list[str]:
    """Return one warning per long sentence and per unverifiable research evidence entry."""
    warnings = [
        f"{path}: sentence has {count} words, over the ASD-STE100 limit of "
        f'{MAX_SENTENCE_WORDS}: "{preview}"'
        for path, count, preview in _long_sentences(manifest)
    ]
    warnings.extend(_evidence_warnings(manifest, workspace))
    return warnings


def _long_sentences(manifest: NormalizedManifest) -> Iterator[tuple[str, int, str]]:
    for path, text in iter_strings(manifest, NON_PROSE_FIELDS):
        for sentence in SENTENCE_END.split(text.strip()):
            words = sentence.split()
            if len(words) > MAX_SENTENCE_WORDS:
                yield path, len(words), " ".join(words[:PREVIEW_WORDS]) + " ..."


def iter_strings(
    value: Any, excluded_keys: frozenset[str] = frozenset()
) -> Iterator[tuple[str, str]]:
    """Yield every string with its manifest path, skipping excluded keys, without recursion."""
    pending: list[tuple[str, Any]] = [("", value)]
    while pending:
        item_path, item = pending.pop()
        if isinstance(item, str):
            yield item_path, item
        elif isinstance(item, dict):
            pending.extend(
                (f"{item_path}.{key}" if item_path else key, child)
                for key, child in reversed(item.items())
                if key not in excluded_keys
            )
        elif isinstance(item, list):
            pending.extend(
                (f"{item_path}[{index}]", child) for index, child in reversed(list(enumerate(item)))
            )


def _evidence_warnings(manifest: NormalizedManifest, workspace: Path) -> Iterator[str]:
    root = _resolve(workspace)
    root_files = _root_file_names(workspace)
    for name, _, nodes in tree_blocks(manifest["blocks"]):
        for node in iter_tree_nodes(nodes):
            if node.get("source") != "research":
                continue
            for entry in node.get("evidence", []):
                problem = _evidence_problem(entry, workspace, root, root_files)
                if problem:
                    yield f'blocks.{name} {node["id"].upper()}: evidence "{entry}" {problem}'


def _evidence_problem(
    entry: str, workspace: Path, root: Path | None, root_files: frozenset[str]
) -> str:
    """Return why the entry cannot be checked, or an empty string when it names a real source."""
    candidates: list[str] = []
    for raw in entry.split():
        # Keep a leading dot, so `./path` stays relative instead of becoming `/path`.
        token = raw.lstrip(TOKEN_PUNCTUATION).rstrip(TOKEN_PUNCTUATION + ".:")
        if URL.match(token):
            return ""
        token = LOCATION_SUFFIX.sub("", token)
        if (
            "/" in token
            or token in root_files
            or (FILE_NAME.match(token) and not ABBREVIATION.match(token))
        ):
            candidates.append(token)
    if not candidates:
        return "names no repository path or URL"
    existing = [
        (candidate, path)
        for candidate in candidates
        if (path := _resolve(workspace / candidate)) is not None and _exists(path)
    ]
    if root is not None and any(path.is_relative_to(root) for _, path in existing):
        return ""
    outside = [candidate for candidate, _ in existing]
    if outside:
        return f"names {', '.join(outside)}, which resolves outside {workspace}"
    return f"names {', '.join(candidates)}, which does not exist under {workspace}"


def _root_file_names(workspace: Path) -> frozenset[str]:
    """Return the exact names of files at the workspace root, such as `LICENSE` or `Makefile`.

    Matching listed names, not probing each token, keeps a prose word such as `license` from
    passing on a case-insensitive filesystem; directories are left out because their names
    are often ordinary words such as `tests`.
    """
    try:
        return frozenset(entry.name for entry in workspace.iterdir() if _is_file(entry))
    except OSError:
        return frozenset()


def _is_file(path: Path) -> bool:
    try:
        return path.is_file()
    except OSError:
        return False


def _resolve(path: Path) -> Path | None:
    """Resolve symlinks and `..`, so a path that escapes the workspace cannot pass as inside it."""
    try:
        return path.resolve()
    # ValueError covers paths the OS rejects outright, such as ones with a null byte.
    except OSError, ValueError:
        return None


def _exists(path: Path) -> bool:
    try:
        return path.exists()
    except OSError:
        return False


__all__ = ["MAX_SENTENCE_WORDS", "iter_strings", "manifest_warnings"]
