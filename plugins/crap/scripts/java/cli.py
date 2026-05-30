from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    __package__ = "java"

from .graph import boundary_summary, build_call_edges, build_chains, detect_project_packages, reachable_symbol_ids, risky_or_ambiguous_symbols
from .parser import extract_java_symbols
from .render import agent_context_for, dot_for_symbols, markdown_for_symbols, symbol_payload
from .scanner import DEFAULT_MAX_FILE_SIZE, IGNORE_DIRS, changed_code, iter_files


def emit(text: str, output: Path | None) -> None:
    if output:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(text)
    else:
        print(text, end="" if text.endswith("\n") else "\n")


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Generate Java method-level call graph")
    ap.add_argument("root", nargs="?", default=".", type=Path)
    ap.add_argument("--format", choices=["markdown", "json", "dot", "agent"], default="markdown")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--direction", choices=["callees", "callers", "both"], default="both")
    ap.add_argument("--depth", type=int, default=8)
    ap.add_argument("--base-ref", default="HEAD")
    ap.add_argument("--max-file-size", type=int, default=DEFAULT_MAX_FILE_SIZE)
    ap.add_argument("--ignore-dir", action="append", default=[])
    ap.add_argument("--exclude", action="append", default=[])
    ap.add_argument("--include-generated", action="store_true")
    ap.add_argument("--include-tests", action="store_true", help="Include test sources/classes; tests are excluded by default")
    ap.add_argument("--include-snippets", action="store_true", help="Include source snippets in json/agent output")
    ap.add_argument("--snippet-lines", type=int, default=80, help="Maximum snippet lines per method")
    ap.add_argument("--project-package", action="append", default=[], help="Project package root to include in application call edges; repeatable. Auto-detected when omitted.")
    ap.add_argument("--edge-scope", choices=["project", "resolved", "all"], default="project", help="project=project-local edges plus boundaries, resolved=any local resolved symbol, all=also show resolved external/library calls")
    ap.add_argument("--output", type=Path)
    return ap


def run(args: argparse.Namespace) -> int:
    root = args.root.resolve()
    ignore_dirs = IGNORE_DIRS | set(args.ignore_dir)
    changed = None if args.all else changed_code(root, ignore_dirs, args.exclude, args.max_file_size, args.include_generated, args.base_ref, args.include_tests)
    files = list(iter_files(root, ignore_dirs, args.exclude, args.max_file_size, args.include_generated, args.include_tests))
    symbols = []
    for path in files:
        symbols.extend(extract_java_symbols(path, root, None if changed is None else changed.get(path)))
    project_packages = detect_project_packages(symbols, args.project_package)
    edges = build_call_edges(symbols, project_packages, args.edge_scope)
    if args.all:
        visible_ids = {s.id for s in symbols}
    else:
        changed_ids = {s.id for s in symbols if s.changed}
        if not changed_ids:
            print("No changed Java methods found under the selected root. Use --all to show the full Java symbol graph.")
            return 0
        visible_ids = reachable_symbol_ids(symbols, edges, args.direction, args.depth, changed_ids)
    visible_symbols = [s for s in symbols if s.id in visible_ids]
    visible_edges = [e for e in edges if e.source in visible_ids and (e.target in visible_ids or e.external)]
    root_ids = {s.id for s in symbols if s.changed} if not args.all else {s.id for s in visible_symbols}
    chains = build_chains(symbols, edges, root_ids, args.direction, args.depth)
    visible_chains = [c for c in chains if all(node in visible_ids or str(node).startswith("external:") for node in c.get("path", []))]

    if args.format == "json":
        changed_roots = [s for s in visible_symbols if s.changed]
        payload = {
            "summary": {
                "root": str(root), "language": "java", "mode": "all" if args.all else "changed-call-chain",
                "direction": args.direction, "depth": args.depth, "includeTests": args.include_tests,
                "projectPackages": project_packages, "edgeScope": args.edge_scope,
                "scannedSymbols": len(symbols), "displayedSymbols": len(visible_symbols), "changedRootCount": len(changed_roots),
                "heuristicParser": True,
            },
            "projectPackages": project_packages,
            "edgeScope": args.edge_scope,
            "changedRoots": [symbol_payload(s, root, args.include_snippets, args.snippet_lines, project_packages, args.edge_scope) for s in changed_roots],
            "boundaries": boundary_summary(visible_edges),
            "riskyOrAmbiguousSymbols": risky_or_ambiguous_symbols(visible_symbols, visible_edges),
            "symbols": [symbol_payload(s, root, args.include_snippets, args.snippet_lines, project_packages, args.edge_scope) for s in visible_symbols],
            "edges": [asdict(e) for e in visible_edges],
            "chains": visible_chains,
        }
        emit(json.dumps(payload, indent=2) + "\n", args.output)
    elif args.format == "dot":
        emit(dot_for_symbols(visible_symbols, visible_edges), args.output)
    elif args.format == "agent":
        emit(agent_context_for(visible_symbols, visible_edges, visible_chains, root, args.include_snippets, args.snippet_lines, project_packages, args.edge_scope), args.output)
    else:
        emit(markdown_for_symbols(visible_symbols, visible_edges), args.output)
    return 0


def main() -> None:
    raise SystemExit(run(build_parser().parse_args()))


if __name__ == "__main__":
    main()
