from __future__ import annotations

import json
from dataclasses import asdict
from io import StringIO
from pathlib import Path

from .graph import boundary_for_fqcn, boundary_summary, is_project_fqcn, risky_or_ambiguous_symbols
from .model import CallEdge, SymbolMetric


def dot_escape(value: object) -> str:
    return str(value).replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')


def filtered_symbol_calls(s: SymbolMetric, project_packages: list[str], edge_scope: str) -> list[str]:
    if edge_scope == "all":
        return sorted(s.calls)
    targets = s.call_targets or {}
    return sorted(call for call in s.calls if is_project_fqcn(targets.get(call, ""), project_packages) or boundary_for_fqcn(targets.get(call, "")))


def snippet_for_symbol(root: Path, s: SymbolMetric, max_lines: int) -> str:
    try:
        lines = (root / s.path).read_text(errors="ignore").splitlines()
    except OSError:
        return ""
    start = max(1, s.start_line)
    end = min(len(lines), s.end_line, start + max_lines - 1)
    return "\n".join(f"{no}: {lines[no - 1]}" for no in range(start, end + 1))


def symbol_payload(s: SymbolMetric, root: Path | None = None, include_snippet: bool = False, snippet_lines: int = 80, project_packages: list[str] | None = None, edge_scope: str = "project") -> dict[str, object]:
    project_packages = project_packages or []
    payload = {**asdict(s), "path": s.path.as_posix(), "file": s.path.as_posix(), "lineRange": {"start": s.start_line, "end": s.end_line}, "calls": filtered_symbol_calls(s, project_packages, edge_scope)}
    if root and include_snippet:
        payload["snippet"] = snippet_for_symbol(root, s, snippet_lines)
    return payload


def dot_for_symbols(symbols: list[SymbolMetric], edges: list[CallEdge]) -> str:
    visible = {s.id for s in symbols}
    out = StringIO()
    print("digraph crap_call_graph {", file=out)
    print('  graph [rankdir="LR"];', file=out)
    for s in symbols:
        color = "red" if s.changed else ("purple" if s.boundary else "gray")
        label = f"{s.class_name}.{s.name}\\n{s.path}:{s.start_line} C={s.complexity}"
        print(f'  "{dot_escape(s.id)}" [label="{dot_escape(label)}", color="{color}"];', file=out)
    for node in sorted({e.target for e in edges if e.external and e.source in visible}):
        print(f'  "{dot_escape(node)}" [shape="box", style="dashed", color="blue", label="{dot_escape(node)}"];', file=out)
    for e in edges:
        if e.source in visible and (e.target in visible or e.external):
            print(f'  "{dot_escape(e.source)}" -> "{dot_escape(e.target)}" [label="{dot_escape(e.label)}"];', file=out)
    print("}", file=out)
    return out.getvalue()


def markdown_for_symbols(symbols: list[SymbolMetric], edges: list[CallEdge]) -> str:
    out = StringIO()
    print("# Java Changed-Code Call Graph\n", file=out)
    print(f"Symbols: {len(symbols)}. Edges: {len(edges)}. Changed roots: {sum(1 for s in symbols if s.changed)}.\n", file=out)
    print("| Symbol | File | Lines | Complexity | Changed | Boundary |", file=out)
    print("| --- | --- | ---: | ---: | --- | --- |", file=out)
    for s in sorted(symbols, key=lambda x: (not x.changed, x.path.as_posix(), x.start_line)):
        print(f"| `{s.class_name}.{s.name}` | `{s.path}` | {s.start_line}-{s.end_line} | {s.complexity} | {str(s.changed).lower()} | {s.boundary or ''} |", file=out)
    return out.getvalue()


def agent_context_for(symbols: list[SymbolMetric], edges: list[CallEdge], chains: list[dict[str, object]], root: Path, include_snippets: bool, snippet_lines: int, project_packages: list[str], edge_scope: str) -> str:
    by_id = {s.id: s for s in symbols}
    changed = [s for s in symbols if s.changed]
    risky = risky_or_ambiguous_symbols(symbols, edges)
    out = StringIO()
    print("# Java Call Graph Context for AI Agents\n", file=out)
    print(f"Project packages: `{', '.join(project_packages) or 'n/a'}`. Edge scope: `{edge_scope}`.\n", file=out)
    print("## Changed methods\n", file=out)
    if not changed:
        print("- No changed methods in displayed graph (`--all` may have been used).", file=out)
    for s in changed:
        print(f"- `{s.class_name}.{s.name}` — `{s.path}:{s.start_line}-{s.end_line}`", file=out)
    print("\n## Affected call chains\n", file=out)
    changed_ids = {s.id for s in changed}
    for chain in chains[:40]:
        labels = chain.get("labels", [])
        if labels:
            print("```text", file=out)
            for i, label in enumerate(labels):
                marker = " [changed]" if chain.get("path", [])[i] in changed_ids else ""
                print(f"{'  ' * i}-> {label}{marker}" if i else f"{label}{marker}", file=out)
            print("```", file=out)
    print("\n## External boundaries\n", file=out)
    for e in [edge for edge in edges if edge.external]:
        src = by_id.get(e.source)
        print(f"- `{e.target}` reached from `{src.class_name + '.' + src.name if src else e.source}` ({e.reason})", file=out)
    print("\n## Risky or ambiguous symbols\n", file=out)
    if not risky:
        print("- None detected in displayed graph.", file=out)
    for item in risky[:30]:
        print(f"- `{item['label']}` — `{item['file']}:{item['lineRange']['start']}-{item['lineRange']['end']}` ({', '.join(item['reasons'])})", file=out)
    print("\n## Recommended inspection order\n", file=out)
    ordered = sorted(symbols, key=lambda s: (not s.changed, bool(s.boundary), -s.complexity, s.path.as_posix(), s.start_line))
    for i, s in enumerate(ordered[:30], 1):
        print(f"{i}. `{s.class_name}.{s.name}` — `{s.path}:{s.start_line}-{s.end_line}` C={s.complexity}{' boundary=' + s.boundary if s.boundary else ''}", file=out)
    if include_snippets:
        print("\n## Source snippets\n", file=out)
        for s in ordered[:20]:
            snip = snippet_for_symbol(root, s, snippet_lines)
            if snip:
                print(f"### `{s.class_name}.{s.name}` — `{s.path}`\n", file=out)
                print("```java", file=out)
                print(snip, file=out)
                print("```", file=out)
    context = {
        "projectPackages": project_packages,
        "edgeScope": edge_scope,
        "changedRoots": [symbol_payload(s, root, include_snippets, snippet_lines, project_packages, edge_scope) for s in changed],
        "boundaries": boundary_summary(edges),
        "riskyOrAmbiguousSymbols": risky,
        "symbols": [symbol_payload(s, root, include_snippets, snippet_lines, project_packages, edge_scope) for s in symbols],
        "edges": [asdict(e) for e in edges],
        "chains": chains,
    }
    print("\n## Machine-readable context\n", file=out)
    print("```json", file=out)
    print(json.dumps(context, indent=2), file=out)
    print("```", file=out)
    return out.getvalue()
