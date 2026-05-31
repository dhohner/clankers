#!/usr/bin/env python3
"""Create a local complexity/dependency graph for CRAP analysis.

This intentionally uses only the Python standard library so it can be copied into
most repositories and run without installation.

Examples:
  python plugins/crap/scripts/crap-complexity-graph.py . --format markdown  # changed code only by default
  python plugins/crap/scripts/crap-complexity-graph.py src --all --format dot > crap.dot
  python plugins/crap/scripts/crap-complexity-graph.py . --coverage coverage-summary.json --fail-on high
  python plugins/crap/scripts/crap-complexity-graph.py . --format sarif --output crap.sarif

Coverage support is best-effort. Pass a JaCoCo XML report or a simple JSON
object keyed by file path with line/statement percentage values. If --coverage
is omitted, common coverage artifact paths are
auto-detected under the selected root.
The CRAP score follows the Artima formula:
  CRAP = complexity^2 * (1 - coverage)^3 + complexity
where coverage is 0.0-1.0.
"""
from __future__ import annotations

import argparse
import ast
import fnmatch
import json
import os
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from concurrent.futures import ProcessPoolExecutor
from dataclasses import asdict, dataclass
from io import StringIO
from pathlib import Path
from typing import Iterable

CODE_EXTENSIONS = {
    ".java",
    ".py",
}
IGNORE_DIRS = {".git", "node_modules", "dist", "build", "coverage", ".next", "target", "vendor", "__pycache__"}
DEFAULT_MAX_FILE_SIZE = 1_000_000
RISK_ORDER = {"low": 0, "medium": 1, "high": 2}
DEFAULT_MEDIUM_COMPLEXITY = 15
DEFAULT_HIGH_COMPLEXITY = 30
DEFAULT_MEDIUM_SCORE = 30.0
DEFAULT_HIGH_SCORE = 60.0
DEFAULT_WORKERS = 1
COVERAGE_GLOBS = (
    "coverage/coverage-summary.json",
    "**/coverage/coverage-summary.json",
    "target/site/jacoco/jacoco.xml",
    "target/site/jacoco-*/jacoco.xml",
    "**/target/site/jacoco/jacoco.xml",
    "**/target/site/jacoco-*/jacoco.xml",
    "build/reports/jacoco/test/jacocoTestReport.xml",
    "**/build/reports/jacoco/test/jacocoTestReport.xml",
)
GENERATED_FILE_PATTERNS = (
    "*.generated.*",
    "*.gen.*",
    "*_pb2.py",
)

JAVA_BRANCH_RE = re.compile(r"\b(if|else\s+if|for|while|case|catch|switch|default)\b|&&|\|\||\?")
PY_BRANCH_RE = re.compile(r"\b(if|for|while|except|elif|match|case)\b")
FUNC_RE = re.compile(r"\b(function\s+\w+|def\s+\w+|class\s+\w+|[A-Za-z_$][\w$]*\s*[:=]\s*(?:async\s*)?\([^)]*\)\s*=>|(?:public|private|protected|static|async|export|final|open|override|func)\s+[^\n{;=]+\()")
IMPORT_RE = re.compile(r"(?:import\s+.*?\s+from\s+['\"]([^'\"]+)|export\s+.*?\s+from\s+['\"]([^'\"]+)|import\s+['\"]([^'\"]+)|import\(['\"]([^'\"]+)['\"]\)|require\(['\"]([^'\"]+)['\"]\)|from\s+([\w.]+)\s+import|^\s*import\s+([A-Za-z_][\w.]*))", re.MULTILINE)
COMMENT_RE = re.compile(r"/\*.*?\*/|//.*?$|#.*?$", re.MULTILINE | re.DOTALL)
STRING_RE = re.compile(r"'''[\s\S]*?'''|\"\"\"[\s\S]*?\"\"\"|'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"|`(?:\\.|[^`\\])*`")


@dataclass
class FileMetric:
    path: Path
    language: str
    loc: int
    complexity: int
    functions: int
    imports: set[str]
    coverage: float | None = None
    bytes: int = 0
    changed_lines: int | None = None

    @property
    def crap(self) -> float | None:
        if self.coverage is None:
            return None
        return (self.complexity ** 2) * ((1 - self.coverage) ** 3) + self.complexity


@dataclass
class SymbolMetric:
    id: str
    path: Path
    class_name: str
    name: str
    kind: str
    start_line: int
    end_line: int
    complexity: int
    calls: set[str]
    changed: bool = False
    boundary: str | None = None


@dataclass(frozen=True)
class CallEdge:
    source: str
    target: str
    label: str = ""
    external: bool = False


LANGUAGES_BY_EXTENSION = {
    ".java": "Java",
    ".py": "Python",
}


def language_for(path: Path) -> str:
    return LANGUAGES_BY_EXTENSION.get(path.suffix, path.suffix.lstrip(".") or "unknown")


def clean_code(text: str) -> str:
    """Remove strings/comments before regex scoring to reduce false positives."""
    return COMMENT_RE.sub(" ", STRING_RE.sub(" ", text))


def is_generated(path: Path) -> bool:
    return any(fnmatch.fnmatch(path.name, pattern) for pattern in GENERATED_FILE_PATTERNS)


def should_include_file(path: Path, root: Path, ignore_dirs: set[str], exclude: list[str], max_bytes: int, include_generated: bool) -> bool:
    try:
        rel = path.relative_to(root)
    except ValueError:
        return False
    if set(rel.parts) & ignore_dirs:
        return False
    rel_text = rel.as_posix()
    if any(fnmatch.fnmatch(rel_text, pattern) or fnmatch.fnmatch(path.name, pattern) for pattern in exclude):
        return False
    try:
        if not (path.is_file() and path.suffix in CODE_EXTENSIONS and path.stat().st_size <= max_bytes):
            return False
    except OSError:
        return False
    return include_generated or not is_generated(path)


def iter_files(root: Path, ignore_dirs: set[str], exclude: list[str], max_bytes: int, include_generated: bool) -> Iterable[Path]:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in ignore_dirs]
        for name in filenames:
            p = Path(dirpath) / name
            if should_include_file(p, root, ignore_dirs, exclude, max_bytes, include_generated):
                yield p


def run_git(repo: Path, *args: str, check: bool = True) -> str:
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=check,
    ).stdout


def git_root(path: Path) -> Path | None:
    try:
        out = run_git(path, "rev-parse", "--show-toplevel").strip()
        return Path(out).resolve() if out else None
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def parse_changed_lines(diff_text: str) -> set[int]:
    """Return new-file line numbers touched by a unified diff."""
    changed: set[int] = set()
    for line in diff_text.splitlines():
        if not line.startswith("@@"):
            continue
        match = re.search(r"\+(\d+)(?:,(\d+))?", line)
        if not match:
            continue
        start = int(match.group(1))
        count = int(match.group(2) or "1")
        changed.update(range(start, start + count))
    return changed


def porcelain_status(repo: Path) -> list[tuple[str, str]]:
    """Return (status-code, repo-relative-path) pairs from NUL-delimited porcelain."""
    raw = subprocess.run(
        ["git", "-C", str(repo), "status", "--porcelain=v1", "-z", "--untracked-files=all"],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=True,
    ).stdout
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


def changed_code(root: Path, ignore_dirs: set[str], exclude: list[str], max_bytes: int, include_generated: bool, base_ref: str) -> dict[Path, set[int]]:
    """Return staged, unstaged, and untracked changed code line numbers under root."""
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
            repo_rel = path.relative_to(repo)
            if not should_include_file(path, root, ignore_dirs, exclude, max_bytes, include_generated):
                continue
            if code == "??":
                files[path] = set(range(1, len(path.read_text(errors="ignore").splitlines()) + 1))
            else:
                diff = run_git(repo, "diff", "--unified=0", base_ref, "--", str(repo_rel))
                lines = parse_changed_lines(diff)
                if lines:
                    files[path] = lines
        except (ValueError, OSError, subprocess.CalledProcessError):
            continue
    return dict(sorted(files.items()))


def coverage_keys(key: str, root: Path) -> set[str]:
    p = Path(key)
    keys = {str(p), "./" + str(p)}
    if not p.is_absolute():
        keys.add(str((root / p).resolve()))
    return keys


def load_json_coverage(path: Path, root: Path) -> dict[str, float]:
    data = json.loads(path.read_text())
    out: dict[str, float] = {}
    for key, value in data.items():
        if key == "total":
            continue
        pct = None
        if isinstance(value, dict):
            for bucket in ("statements", "lines"):
                if isinstance(value.get(bucket), dict) and "pct" in value[bucket]:
                    pct = value[bucket]["pct"]
                    break
            if pct is None and "pct" in value:
                pct = value["pct"]
        elif isinstance(value, (int, float)):
            pct = value
        if pct is None:
            continue
        cov = max(0.0, min(1.0, float(pct) / 100.0))
        for k in coverage_keys(key, root):
            out[k] = cov
    return out


def load_jacoco_coverage(path: Path, root: Path) -> dict[str, float]:
    """Load JaCoCo XML line coverage keyed by package/sourcefile path suffix."""
    report = ET.parse(path).getroot()
    out: dict[str, float] = {}
    for package in report.findall("package"):
        package_name = package.get("name", "").strip("/")
        for sourcefile in package.findall("sourcefile"):
            name = sourcefile.get("name")
            if not name:
                continue
            line_counter = next((c for c in sourcefile.findall("counter") if c.get("type") == "LINE"), None)
            if line_counter is None:
                continue
            missed = int(line_counter.get("missed", "0"))
            covered = int(line_counter.get("covered", "0"))
            total = missed + covered
            if total <= 0:
                continue
            key = f"{package_name}/{name}" if package_name else name
            cov = covered / total
            for k in coverage_keys(key, root):
                out[k] = cov
    return out


def discover_coverage(root: Path) -> Path | None:
    for pattern in COVERAGE_GLOBS:
        for candidate in root.glob(pattern):
            if candidate.is_file():
                return candidate
    return None


def load_coverage(path: Path | None, root: Path, auto_discover: bool) -> tuple[dict[str, float], Path | None]:
    source = path or (discover_coverage(root) if auto_discover else None)
    if not source:
        return {}, None
    try:
        if source.suffix.lower() == ".xml":
            return load_jacoco_coverage(source, root), source
        return load_json_coverage(source, root), source
    except (OSError, json.JSONDecodeError, ET.ParseError, ValueError) as exc:
        print(f"Warning: unable to load coverage from {source}: {exc}", file=sys.stderr)
        return {}, source


class PythonMetricVisitor(ast.NodeVisitor):
    def __init__(self) -> None:
        self.complexity = 1
        self.functions = 0
        self.imports: set[str] = set()

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self.functions += 1
        self.generic_visit(node)

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        self.functions += 1
        self.generic_visit(node)

    def visit_If(self, node: ast.If) -> None:
        self.complexity += 1
        self.generic_visit(node)

    def visit_For(self, node: ast.For) -> None:
        self.complexity += 1
        self.generic_visit(node)

    visit_AsyncFor = visit_For

    def visit_While(self, node: ast.While) -> None:
        self.complexity += 1
        self.generic_visit(node)

    def visit_ExceptHandler(self, node: ast.ExceptHandler) -> None:
        self.complexity += 1
        self.generic_visit(node)

    def visit_IfExp(self, node: ast.IfExp) -> None:
        self.complexity += 1
        self.generic_visit(node)

    def visit_BoolOp(self, node: ast.BoolOp) -> None:
        self.complexity += max(0, len(node.values) - 1)
        self.generic_visit(node)

    def visit_comprehension(self, node: ast.comprehension) -> None:
        self.complexity += 1 + len(node.ifs)
        self.generic_visit(node)

    def visit_Match(self, node: ast.Match) -> None:  # py>=3.10
        self.complexity += len(node.cases)
        self.generic_visit(node)

    def visit_Import(self, node: ast.Import) -> None:
        self.imports.update(alias.name for alias in node.names)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        if node.module:
            self.imports.add(node.module)


def branch_regex(path: Path) -> re.Pattern[str]:
    if path.suffix == ".java":
        return JAVA_BRANCH_RE
    if path.suffix == ".py":
        return PY_BRANCH_RE
    return JAVA_BRANCH_RE


def imports_in(scanned: str) -> set[str]:
    return {next(g for g in m.groups() if g) for m in IMPORT_RE.finditer(scanned)}


def code_metrics(path: Path, text: str, changed_lines: set[int] | None = None) -> tuple[int, int, int, set[str]]:
    branches = branch_regex(path)
    if changed_lines is not None:
        selected = "\n".join(line for no, line in enumerate(text.splitlines(), start=1) if no in changed_lines)
        scanned = clean_code(selected)
        loc = len([ln for ln in scanned.splitlines() if ln.strip()])
        return loc, (1 + len(branches.findall(scanned)) if loc else 0), len(FUNC_RE.findall(scanned)), imports_in(scanned)

    scanned = clean_code(text)
    loc = len([ln for ln in scanned.splitlines() if ln.strip()])
    if path.suffix == ".py":
        try:
            visitor = PythonMetricVisitor()
            visitor.visit(ast.parse(text))
            return loc, visitor.complexity, visitor.functions, visitor.imports
        except SyntaxError:
            pass
    return loc, 1 + len(branches.findall(scanned)), len(FUNC_RE.findall(scanned)), imports_in(scanned)


def metric_for(path: Path, root: Path, coverage: dict[str, float], changed_lines: set[int] | None = None) -> FileMetric:
    text = path.read_text(errors="ignore")
    loc, complexity, functions, imports = code_metrics(path, text, changed_lines)
    rel = path.relative_to(root)
    cov = coverage.get(str(path))
    if cov is None:
        cov = coverage.get(str(rel))
    if cov is None:
        cov = coverage.get("./" + str(rel))
    if cov is None:
        rel_posix = rel.as_posix()
        for key, value in coverage.items():
            if rel_posix.endswith(str(key).lstrip("./")) or str(key).lstrip("./").endswith(rel_posix):
                cov = value
                break
    return FileMetric(rel, language_for(path), loc, complexity, functions, imports, cov, path.stat().st_size, len(changed_lines) if changed_lines is not None else None)


def metric_job(args: tuple[Path, Path, dict[str, float], set[int] | None]) -> FileMetric:
    return metric_for(*args)


def severity(m: FileMetric, medium_complexity: int = DEFAULT_MEDIUM_COMPLEXITY, high_complexity: int = DEFAULT_HIGH_COMPLEXITY, medium_score: float = DEFAULT_MEDIUM_SCORE, high_score: float = DEFAULT_HIGH_SCORE) -> str:
    score = m.crap if m.crap is not None else m.complexity
    if score >= high_score or m.complexity >= high_complexity:
        return "high"
    if score >= medium_score or m.complexity >= medium_complexity:
        return "medium"
    return "low"


@dataclass(frozen=True)
class Thresholds:
    medium_complexity: int = DEFAULT_MEDIUM_COMPLEXITY
    high_complexity: int = DEFAULT_HIGH_COMPLEXITY
    medium_score: float = DEFAULT_MEDIUM_SCORE
    high_score: float = DEFAULT_HIGH_SCORE


def risk(m: FileMetric, thresholds: Thresholds) -> str:
    return severity(m, thresholds.medium_complexity, thresholds.high_complexity, thresholds.medium_score, thresholds.high_score)


def sorted_metrics(metrics: list[FileMetric], thresholds: Thresholds) -> list[FileMetric]:
    return sorted(metrics, key=lambda x: (RISK_ORDER[risk(x, thresholds)], x.crap if x.crap is not None else x.complexity, x.loc), reverse=True)


def filtered_metrics(metrics: list[FileMetric], min_risk: str, top: int | None, thresholds: Thresholds) -> list[FileMetric]:
    out = [m for m in sorted_metrics(metrics, thresholds) if RISK_ORDER[risk(m, thresholds)] >= RISK_ORDER[min_risk]]
    return out[:top] if top else out


def summary_for(metrics: list[FileMetric], display: list[FileMetric], coverage_source: Path | None, mode: str, root: Path, thresholds: Thresholds) -> dict[str, object]:
    counts = {level: sum(1 for m in metrics if risk(m, thresholds) == level) for level in RISK_ORDER}
    covered = sum(1 for m in metrics if m.coverage is not None)
    return {
        "root": str(root),
        "schemaVersion": 1,
        "mode": mode,
        "scannedFiles": len(metrics),
        "displayedFiles": len(display),
        "riskCounts": counts,
        "coverageSource": str(coverage_source) if coverage_source else None,
        "coveredFiles": covered,
        "thresholds": asdict(thresholds),
    }


def metric_payload(m: FileMetric, thresholds: Thresholds) -> dict[str, object]:
    return {
        **asdict(m),
        "path": str(m.path),
        "imports": sorted(m.imports),
        "crap": m.crap,
        "risk": risk(m, thresholds),
    }


def markdown_for(metrics: list[FileMetric], total: int, coverage_source: Path | None, thresholds: Thresholds) -> str:
    out = StringIO()
    counts = {level: sum(1 for m in metrics if risk(m, thresholds) == level) for level in RISK_ORDER}
    covered = sum(1 for m in metrics if m.coverage is not None)
    print("# CRAP Complexity Graph Summary\n", file=out)
    print(f"Scanned files: {total}. Displayed: {len(metrics)}. High: {counts['high']}. Medium: {counts['medium']}. Low: {counts['low']}.\n", file=out)
    if coverage_source and covered:
        print(f"Mode: full CRAP where coverage maps to files ({covered}/{len(metrics)} displayed). Coverage: `{coverage_source}`.\n", file=out)
    elif coverage_source:
        print(f"Mode: complexity-only fallback; coverage artifact was found but did not map to displayed files. Coverage: `{coverage_source}`.\n", file=out)
    else:
        print("Mode: complexity-only fallback; no coverage artifact found/provided, so Coverage and CRAP are n/a.\n", file=out)
    print("| File | Language | LOC | Complexity | Functions | Coverage | CRAP | Risk | Imports |", file=out)
    print("| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |", file=out)
    for m in metrics:
        cov = "n/a" if m.coverage is None else f"{m.coverage:.0%}"
        crap = "n/a" if m.crap is None else f"{m.crap:.1f}"
        print(f"| `{m.path}` | {m.language} | {m.loc} | {m.complexity} | {m.functions} | {cov} | {crap} | {risk(m, thresholds)} | {len(m.imports)} |", file=out)
    return out.getvalue()


def dot_escape(value: object) -> str:
    return str(value).replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')


def candidate_module_paths(base: Path) -> list[Path]:
    """Return likely source files for an import base path without requiring deps."""
    candidates = [base]
    candidates.extend(base.with_suffix(ext) for ext in CODE_EXTENSIONS if not base.suffix)
    candidates.append(base / "__init__.py")
    return candidates


def build_import_index(metrics: list[FileMetric], root: Path) -> dict[str, FileMetric]:
    """Index scanned files by common import spellings for deterministic local resolution."""
    index: dict[str, FileMetric] = {}
    for m in metrics:
        rel = m.path.as_posix()
        no_suffix = m.path.with_suffix("").as_posix()
        abs_no_suffix = (root / m.path).with_suffix("").as_posix()
        keys = {
            rel,
            "./" + rel,
            no_suffix,
            "./" + no_suffix,
            abs_no_suffix,
            no_suffix.replace("/", "."),
        }
        if m.path.name == "__init__.py":
            pkg = m.path.parent.as_posix()
            keys.update({pkg, "./" + pkg, pkg.replace("/", ".")})
        if m.path.name.startswith("index."):
            pkg = m.path.parent.as_posix()
            keys.update({pkg, "./" + pkg})
        for key in keys:
            index.setdefault(key.lstrip("/"), m)
    return index


def resolve_import(imp: str, source: FileMetric, root: Path, index: dict[str, FileMetric]) -> FileMetric | None:
    """Resolve a parsed import string to a scanned local file when possible.

    Handles relative Python imports, Python dotted modules/packages, simple
    repo-root imports, Python packages, and Java package imports.
    External package imports intentionally return None.
    """
    imp = imp.strip()
    if not imp:
        return None
    if imp.endswith(".*"):
        imp = imp[:-2]

    source_dir = root / source.path.parent
    bases: list[Path] = []
    if imp.startswith("."):
        # Relative imports normalize here.
        if imp.startswith(("./", "../")):
            bases.append((source_dir / imp).resolve())
        else:
            level = len(imp) - len(imp.lstrip("."))
            remainder = imp[level:].replace(".", "/")
            base = source_dir
            for _ in range(max(0, level - 1)):
                base = base.parent
            bases.append((base / remainder).resolve())
    elif imp.startswith("/"):
        bases.append(root / imp.lstrip("/"))
    elif imp.startswith(("@/", "~/")):
        alias_path = imp[2:]
        bases.extend([root / alias_path, root / "src" / alias_path])
    else:
        # Python/Java dotted module path and common repo-root / src-root aliases.
        slash = imp.replace(".", "/")
        bases.extend([root / imp, root / slash, root / "src" / imp, root / "src" / slash])

    for base in bases:
        for candidate in candidate_module_paths(base):
            try:
                rel = candidate.resolve().relative_to(root).as_posix()
            except ValueError:
                continue
            target = index.get(rel) or index.get(Path(rel).with_suffix("").as_posix())
            if target and target.path != source.path:
                return target

    # Fall back to precomputed spellings, including Java/Python dotted names.
    for key in (imp, imp.lstrip("./"), imp.replace(".", "/"), imp.replace("/", ".")):
        target = index.get(key)
        if target and target.path != source.path:
            return target
    return None


def dependency_edges(metrics: list[FileMetric], root: Path) -> list[tuple[FileMetric, FileMetric, str]]:
    index = build_import_index(metrics, root)
    edges: list[tuple[FileMetric, FileMetric, str]] = []
    seen: set[tuple[Path, Path, str]] = set()
    for m in metrics:
        for imp in sorted(m.imports):
            target = resolve_import(imp, m, root, index)
            if not target:
                continue
            key = (m.path, target.path, imp)
            if key not in seen:
                seen.add(key)
                edges.append((m, target, imp))
    return edges


def dependency_edge_payload(edge: tuple[FileMetric, FileMetric, str]) -> dict[str, str]:
    source, target, imp = edge
    return {"source": source.path.as_posix(), "target": target.path.as_posix(), "import": imp}


def dot_for(metrics: list[FileMetric], root: Path, thresholds: Thresholds, graph_metrics: list[FileMetric] | None = None) -> str:
    out = StringIO()
    visible = {m.path for m in metrics}
    edge_source = graph_metrics or metrics
    emitted_nodes: set[Path] = set()
    print("digraph crap_complexity {", file=out)
    print('  graph [rankdir="LR"];', file=out)
    for m in metrics:
        color = {"high": "red", "medium": "orange", "low": "gray"}[risk(m, thresholds)]
        print(f'  "{dot_escape(m.path)}" [label="{dot_escape(m.path)}\\nC={m.complexity}", color="{color}"];', file=out)
        emitted_nodes.add(m.path)
    for source, target, imp in dependency_edges(edge_source, root):
        if source.path not in visible and target.path not in visible:
            continue
        for m in (source, target):
            if m.path not in emitted_nodes:
                print(f'  "{dot_escape(m.path)}" [label="{dot_escape(m.path)}\\nC={m.complexity}", color="lightgray", style="dashed"];', file=out)
                emitted_nodes.add(m.path)
        print(f'  "{dot_escape(source.path)}" -> "{dot_escape(target.path)}" [label="{dot_escape(imp)}"];', file=out)
    print("}", file=out)
    return out.getvalue()


def sarif_level(m: FileMetric, thresholds: Thresholds) -> str:
    return {"high": "error", "medium": "warning", "low": "note"}[risk(m, thresholds)]


def sarif_for(metrics: list[FileMetric], root: Path, thresholds: Thresholds) -> dict[str, object]:
    results = []
    for m in metrics:
        score = "n/a" if m.crap is None else f"{m.crap:.1f}"
        results.append({
            "ruleId": f"crap.{risk(m, thresholds)}",
            "level": sarif_level(m, thresholds),
            "message": {
                "text": f"{risk(m, thresholds).upper()} CRAP risk: complexity {m.complexity}, coverage {'n/a' if m.coverage is None else f'{m.coverage:.0%}'}, CRAP {score}."
            },
            "locations": [{
                "physicalLocation": {
                    "artifactLocation": {"uri": m.path.as_posix(), "uriBaseId": "REPOROOT"},
                    "region": {"startLine": 1},
                }
            }],
            "properties": metric_payload(m, thresholds),
        })
    return {
        "version": "2.1.0",
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "runs": [{
            "tool": {
                "driver": {
                    "name": "crap-complexity-graph",
                    "informationUri": "https://github.com/dhohner/clankers/tree/main/plugins/crap",
                    "rules": [
                        {"id": "crap.high", "shortDescription": {"text": "High CRAP risk"}, "helpUri": "https://github.com/dhohner/clankers/tree/main/plugins/crap"},
                        {"id": "crap.medium", "shortDescription": {"text": "Medium CRAP risk"}, "helpUri": "https://github.com/dhohner/clankers/tree/main/plugins/crap"},
                        {"id": "crap.low", "shortDescription": {"text": "Low CRAP risk"}, "helpUri": "https://github.com/dhohner/clankers/tree/main/plugins/crap"},
                    ],
                }
            },
            "originalUriBaseIds": {"REPOROOT": {"uri": root.as_uri() + "/"}},
            "results": results,
        }],
    }


def emit(text: str, output: Path | None) -> None:
    if output:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(text)
    else:
        print(text, end="" if text.endswith("\n") else "\n")


def main() -> None:
    ap = argparse.ArgumentParser(description="Generate local complexity and dependency graph data for CRAP analysis")
    ap.add_argument("root", nargs="?", default=".", type=Path)
    ap.add_argument("--coverage", type=Path, help="JaCoCo XML or simple coverage JSON (auto-detected if omitted)")
    ap.add_argument("--format", choices=["markdown", "json", "dot", "sarif", "agent"], default="markdown")
    ap.add_argument("--graph-level", choices=["file", "symbol"], default="file", help="file=dependency graph, symbol=Java method call graph")
    ap.add_argument("--direction", choices=["callees", "callers", "both"], default="both", help="Symbol graph traversal direction from changed methods")
    ap.add_argument("--depth", type=int, default=8, help="Maximum symbol call-chain depth from changed methods")
    ap.add_argument("--all", action="store_true", help="Analyze all code files under root instead of only locally changed code")
    ap.add_argument("--top", type=int, help="Only display the N riskiest files")
    ap.add_argument("--min-risk", choices=RISK_ORDER.keys(), default="low", help="Only display files at or above this risk")
    ap.add_argument("--fail-on", choices=["medium", "high"], help="Exit non-zero when any scanned file reaches this risk")
    ap.add_argument("--base-ref", default="HEAD", help="Git ref used for changed-line diffs in default changed-code mode")
    ap.add_argument("--max-file-size", type=int, default=DEFAULT_MAX_FILE_SIZE, help="Skip files larger than this many bytes")
    ap.add_argument("--ignore-dir", action="append", default=[], help="Additional directory name to ignore; repeatable")
    ap.add_argument("--exclude", action="append", default=[], help="Glob for repo-relative paths or filenames to exclude; repeatable")
    ap.add_argument("--include-generated", action="store_true", help="Include common generated file patterns that are skipped by default")
    ap.add_argument("--include-tests", action="store_true", help="Include test sources in symbol call graphs; excluded by default")
    ap.add_argument("--include-snippets", action="store_true", help="Include source snippets in symbol json/agent output")
    ap.add_argument("--snippet-lines", type=int, default=80, help="Maximum snippet lines per symbol")
    ap.add_argument("--project-package", action="append", default=[], help="Project package root for symbol call graphs; repeatable")
    ap.add_argument("--edge-scope", choices=["project", "resolved", "all"], default="project", help="Symbol graph edge scope")
    ap.add_argument("--no-auto-coverage", action="store_true", help="Do not auto-detect common coverage artifacts when --coverage is omitted")
    ap.add_argument("--workers", type=int, default=DEFAULT_WORKERS, help="Process workers for CPU-heavy scans; default is 1")
    ap.add_argument("--medium-complexity", type=int, default=DEFAULT_MEDIUM_COMPLEXITY)
    ap.add_argument("--high-complexity", type=int, default=DEFAULT_HIGH_COMPLEXITY)
    ap.add_argument("--medium-score", type=float, default=DEFAULT_MEDIUM_SCORE)
    ap.add_argument("--high-score", type=float, default=DEFAULT_HIGH_SCORE)
    ap.add_argument("--output", type=Path, help="Write output to a file instead of stdout")
    args = ap.parse_args()

    root = args.root.resolve()
    if not root.exists():
        ap.error(f"root does not exist: {root}")
    if args.format == "agent" and args.graph_level != "symbol":
        ap.error("--format agent is only supported with --graph-level symbol")
    if args.medium_complexity > args.high_complexity:
        ap.error("--medium-complexity must be less than or equal to --high-complexity")
    if args.medium_score > args.high_score:
        ap.error("--medium-score must be less than or equal to --high-score")

    ignore_dirs = IGNORE_DIRS | set(args.ignore_dir)
    thresholds = Thresholds(args.medium_complexity, args.high_complexity, args.medium_score, args.high_score)
    coverage, coverage_source = load_coverage(args.coverage, root, not args.no_auto_coverage)
    changed = None if args.all else changed_code(root, ignore_dirs, args.exclude, args.max_file_size, args.include_generated, args.base_ref)

    if args.graph_level == "symbol":
        if args.format == "sarif":
            ap.error("--graph-level symbol currently supports --format markdown, json, dot, or agent")
        graph_files = list(iter_files(root, ignore_dirs, args.exclude, args.max_file_size, args.include_generated))
        languages = {p.suffix for p in graph_files}
        helper: Path | None = None
        if ".java" in languages:
            helper = Path(__file__).resolve().parent / "java" / "cli.py"
        if helper is None:
            ap.error("No supported symbol call-graph language detected under root. Currently supported: Java")
        cmd = [
            sys.executable,
            str(helper),
            str(root),
            "--format", args.format,
            "--direction", args.direction,
            "--depth", str(args.depth),
            "--base-ref", args.base_ref,
            "--max-file-size", str(args.max_file_size),
        ]
        if args.all:
            cmd.append("--all")
        if args.include_generated:
            cmd.append("--include-generated")
        if args.include_tests:
            cmd.append("--include-tests")
        if args.include_snippets:
            cmd.append("--include-snippets")
        cmd.extend(["--snippet-lines", str(args.snippet_lines)])
        cmd.extend(["--edge-scope", args.edge_scope])
        for value in args.project_package:
            cmd.extend(["--project-package", value])
        for value in args.ignore_dir:
            cmd.extend(["--ignore-dir", value])
        for value in args.exclude:
            cmd.extend(["--exclude", value])
        if args.output:
            cmd.extend(["--output", str(args.output)])
        raise SystemExit(subprocess.run(cmd).returncode)

    files = list(iter_files(root, ignore_dirs, args.exclude, args.max_file_size, args.include_generated)) if args.all else list(changed or {})
    worker_count = max(1, min(args.workers, len(files) or 1))
    jobs = [(p, root, coverage, None if changed is None else changed[p]) for p in files]
    if worker_count == 1:
        metrics = [metric_job(job) for job in jobs]
    else:
        with ProcessPoolExecutor(max_workers=worker_count) as pool:
            metrics = list(pool.map(metric_job, jobs))

    if not args.all and not metrics:
        print("No locally changed code files found under the selected root. Use --all to scan every code file.")
        return

    display = filtered_metrics(metrics, args.min_risk, args.top, thresholds)
    if args.format == "json":
        payload = {
            "summary": summary_for(metrics, display, coverage_source, "all" if args.all else "changed", root, thresholds),
            "files": [metric_payload(m, thresholds) for m in display],
            "edges": [dependency_edge_payload(edge) for edge in dependency_edges(metrics, root) if edge[0] in display and edge[1] in display],
        }
        emit(json.dumps(payload, indent=2) + "\n", args.output)
    elif args.format == "sarif":
        emit(json.dumps(sarif_for(display, root, thresholds), indent=2) + "\n", args.output)
    elif args.format == "dot":
        emit(dot_for(display, root, thresholds, metrics), args.output)
    else:
        emit(markdown_for(display, len(metrics), coverage_source, thresholds), args.output)

    if args.fail_on and any(RISK_ORDER[risk(m, thresholds)] >= RISK_ORDER[args.fail_on] for m in metrics):
        sys.exit(2)


if __name__ == "__main__":
    main()
