from __future__ import annotations

import fnmatch
import os
import re
import subprocess
from pathlib import Path
from typing import Iterable

IGNORE_DIRS = {".git", "node_modules", "dist", "build", "coverage", ".next", "target", "vendor", "__pycache__"}
GENERATED_FILE_PATTERNS = ("*.generated.*", "*.gen.*")
TEST_FILE_PATTERNS = ("*Test.java", "*Tests.java", "*IT.java", "*ITCase.java")
TEST_PATH_PARTS = {"test", "tests", "src/test", "__tests__"}
DEFAULT_MAX_FILE_SIZE = 1_000_000


def is_generated(path: Path) -> bool:
    return any(fnmatch.fnmatch(path.name, pattern) for pattern in GENERATED_FILE_PATTERNS)


def is_test_file(path: Path, root: Path) -> bool:
    try:
        rel = path.relative_to(root).as_posix()
    except ValueError:
        rel = path.as_posix()
    parts = set(Path(rel).parts)
    return any(part in parts for part in TEST_PATH_PARTS) or "/src/test/" in f"/{rel}/" or any(fnmatch.fnmatch(path.name, pattern) for pattern in TEST_FILE_PATTERNS)


def should_include_file(path: Path, root: Path, ignore_dirs: set[str], exclude: list[str], max_bytes: int, include_generated: bool, include_tests: bool = False) -> bool:
    try:
        rel = path.relative_to(root)
    except ValueError:
        return False
    if set(rel.parts) & ignore_dirs:
        return False
    rel_text = rel.as_posix()
    if any(fnmatch.fnmatch(rel_text, pattern) or fnmatch.fnmatch(path.name, pattern) for pattern in exclude):
        return False
    if not include_tests and is_test_file(path, root):
        return False
    try:
        return path.is_file() and path.suffix == ".java" and path.stat().st_size <= max_bytes and (include_generated or not is_generated(path))
    except OSError:
        return False


def iter_files(root: Path, ignore_dirs: set[str], exclude: list[str], max_bytes: int, include_generated: bool, include_tests: bool = False) -> Iterable[Path]:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in ignore_dirs]
        for name in filenames:
            p = Path(dirpath) / name
            if should_include_file(p, root, ignore_dirs, exclude, max_bytes, include_generated, include_tests):
                yield p


def run_git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), *args], text=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=True).stdout


def git_root(path: Path) -> Path | None:
    try:
        out = run_git(path, "rev-parse", "--show-toplevel").strip()
        return Path(out).resolve() if out else None
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def parse_changed_lines(diff_text: str) -> set[int]:
    changed: set[int] = set()
    for line in diff_text.splitlines():
        if not line.startswith("@@"):
            continue
        match = re.search(r"\+(\d+)(?:,(\d+))?", line)
        if match:
            start = int(match.group(1))
            count = int(match.group(2) or "1")
            changed.update(range(start, start + count))
    return changed


def porcelain_status(repo: Path) -> list[tuple[str, str]]:
    raw = subprocess.run(["git", "-C", str(repo), "status", "--porcelain=v1", "-z", "--untracked-files=all"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=True).stdout
    parts = raw.decode("utf-8", errors="surrogateescape").split("\0")
    out: list[tuple[str, str]] = []
    i = 0
    while i < len(parts):
        entry = parts[i]
        i += 1
        if not entry:
            continue
        code = entry[:2]
        path = entry[3:]
        if code[:1] in {"R", "C"} or code[1:2] in {"R", "C"}:
            if i < len(parts) and parts[i]:
                path = parts[i]
                i += 1
        out.append((code, path))
    return out


def changed_code(root: Path, ignore_dirs: set[str], exclude: list[str], max_bytes: int, include_generated: bool, base_ref: str, include_tests: bool = False) -> dict[Path, set[int]]:
    repo = git_root(root)
    if repo is None:
        return {}
    files: dict[Path, set[int]] = {}
    for code, rel in porcelain_status(repo):
        if not rel or "D" in code:
            continue
        path = (repo / rel).resolve()
        try:
            path.relative_to(root)
            if not should_include_file(path, root, ignore_dirs, exclude, max_bytes, include_generated, include_tests):
                continue
            if code == "??":
                files[path] = set(range(1, len(path.read_text(errors="ignore").splitlines()) + 1))
            else:
                lines = parse_changed_lines(run_git(repo, "diff", "--unified=0", base_ref, "--", str(path.relative_to(repo))))
                if lines:
                    files[path] = lines
        except (ValueError, OSError, subprocess.CalledProcessError):
            continue
    return files
