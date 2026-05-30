from __future__ import annotations

from dataclasses import asdict

from .model import CallEdge, SymbolMetric
from .parser import JAVA_BOUNDARY_PATTERNS


def is_project_fqcn(fqcn: str, project_packages: list[str]) -> bool:
    return bool(fqcn) and (not project_packages or any(fqcn == pkg or fqcn.startswith(pkg + ".") for pkg in project_packages))


def boundary_for_fqcn(fqcn: str) -> str | None:
    for name, pattern in JAVA_BOUNDARY_PATTERNS:
        if pattern.search(fqcn):
            return name
    return None


def detect_project_packages(symbols: list[SymbolMetric], explicit: list[str]) -> list[str]:
    if explicit:
        return sorted(set(explicit))
    return sorted({s.package for s in symbols if s.package})


def build_call_edges(symbols: list[SymbolMetric], project_packages: list[str], edge_scope: str = "project") -> list[CallEdge]:
    by_fqcn_method: dict[tuple[str, str], list[SymbolMetric]] = {}
    by_simple_method: dict[str, list[SymbolMetric]] = {}
    impls: dict[str, list[str]] = {}
    local_fqcns = {s.fqcn for s in symbols if s.fqcn}
    for s in symbols:
        by_fqcn_method.setdefault((s.fqcn, s.name), []).append(s)
        by_simple_method.setdefault(f"{s.class_name}.{s.name}", []).append(s)
        for iface in s.implements or []:
            impls.setdefault(iface, [])
            if s.fqcn not in impls[iface]:
                impls[iface].append(s.fqcn)
    edges: list[CallEdge] = []
    seen: set[tuple[str, str, str]] = set()
    for s in symbols:
        for call in sorted(s.calls):
            _, _, call_method = call.partition(".")
            resolved_fqcn = (s.call_targets or {}).get(call, "")
            targets = list(by_fqcn_method.get((resolved_fqcn, call_method), [])) if resolved_fqcn else []
            confidence = "high"
            reason = "receiver type resolved through imports/package to local symbol"
            impl_targets: list[SymbolMetric] = []
            if resolved_fqcn in impls:
                for impl_fqcn in impls[resolved_fqcn]:
                    impl_targets.extend(by_fqcn_method.get((impl_fqcn, call_method), []))
            if targets and any(t.class_kind == "interface" for t in targets) and impl_targets:
                targets.extend(t for t in impl_targets if t not in targets)
                confidence = "low" if len(impl_targets) > 1 else "medium"
                reason = "interface method plus implementation heuristic" + ("; multiple plausible implementations" if len(impl_targets) > 1 else "")
            elif not targets and impl_targets:
                targets = impl_targets
                confidence = "low" if len(targets) > 1 else "medium"
                reason = "interface-to-implementation heuristic" + ("; multiple plausible implementations" if len(targets) > 1 else "")
            elif not targets and not resolved_fqcn:
                targets = list(by_simple_method.get(call, []))
                confidence = "low"
                reason = "simple class.method fallback without import/package resolution"
            for t in targets:
                if edge_scope == "project" and not is_project_fqcn(t.fqcn, project_packages):
                    continue
                key = (s.id, t.id, call)
                if key not in seen:
                    seen.add(key)
                    edges.append(CallEdge(s.id, t.id, call, False, confidence, reason, t.fqcn))
            if not targets and resolved_fqcn:
                boundary = boundary_for_fqcn(resolved_fqcn)
                if boundary:
                    target = f"external:{boundary}"
                    key = (s.id, target, boundary)
                    if key not in seen:
                        seen.add(key)
                        edges.append(CallEdge(s.id, target, boundary, True, "external", "resolved imported type matched external boundary", resolved_fqcn))
                elif edge_scope == "all" and resolved_fqcn not in local_fqcns:
                    target = f"external:{resolved_fqcn}.{call_method}"
                    key = (s.id, target, call)
                    if key not in seen:
                        seen.add(key)
                        edges.append(CallEdge(s.id, target, call, True, "low", "resolved imported non-project call", resolved_fqcn))
        if s.boundary:
            target = f"external:{s.boundary}"
            key = (s.id, target, s.boundary)
            if key not in seen:
                seen.add(key)
                edges.append(CallEdge(s.id, target, s.boundary, True, "external", "method/class matched external boundary pattern", None))
    return edges


def reachable_symbol_ids(symbols: list[SymbolMetric], edges: list[CallEdge], direction: str, depth: int, roots: set[str] | None = None) -> set[str]:
    roots = roots if roots is not None else {s.id for s in symbols if s.changed}
    if not roots:
        roots = {s.id for s in symbols}
    outgoing: dict[str, set[str]] = {}
    incoming: dict[str, set[str]] = {}
    for e in edges:
        outgoing.setdefault(e.source, set()).add(e.target)
        incoming.setdefault(e.target, set()).add(e.source)
    seen = set(roots)
    frontier = set(roots)
    for _ in range(max(0, depth)):
        nxt: set[str] = set()
        for node in frontier:
            if direction in {"callees", "both"}:
                nxt.update(outgoing.get(node, set()))
            if direction in {"callers", "both"}:
                nxt.update(incoming.get(node, set()))
        nxt -= seen
        if not nxt:
            break
        seen.update(nxt)
        frontier = nxt
    return seen


def build_chains(symbols: list[SymbolMetric], edges: list[CallEdge], roots: set[str], direction: str, depth: int) -> list[dict[str, object]]:
    by_id = {s.id: s for s in symbols}
    outgoing: dict[str, list[CallEdge]] = {}
    incoming: dict[str, list[CallEdge]] = {}
    for e in edges:
        outgoing.setdefault(e.source, []).append(e)
        incoming.setdefault(e.target, []).append(e)
    chains: list[dict[str, object]] = []

    def label(node: str) -> str:
        s = by_id.get(node)
        return f"{s.class_name}.{s.name}" if s else node

    def append_chain(root: str, dir_name: str, path: list[str]) -> None:
        chains.append({
            "root": root,
            "direction": dir_name,
            "path": path[:],
            "labels": [label(p) for p in path],
            "externalBoundary": next((p for p in path if str(p).startswith("external:")), None),
        })

    def walk(root: str, node: str, path: list[str], dir_name: str, remaining: int) -> None:
        if remaining <= 0:
            append_chain(root, dir_name, path)
            return
        next_edges = outgoing.get(node, []) if dir_name == "callees" else incoming.get(node, [])
        if not next_edges:
            append_chain(root, dir_name, path)
            return
        for e in next_edges[:25]:
            nxt = e.target if dir_name == "callees" else e.source
            if nxt not in path:
                walk(root, nxt, path + [nxt], dir_name, remaining - 1)

    for root in sorted(roots):
        if direction in {"callees", "both"}:
            walk(root, root, [root], "callees", depth)
        if direction in {"callers", "both"}:
            walk(root, root, [root], "callers", depth)
    return chains[:200]


def boundary_summary(edges: list[CallEdge]) -> list[dict[str, object]]:
    counts: dict[str, int] = {}
    sources: dict[str, set[str]] = {}
    for e in edges:
        if not e.external:
            continue
        name = e.target.removeprefix("external:")
        counts[name] = counts.get(name, 0) + 1
        sources.setdefault(name, set()).add(e.source)
    return [{"boundary": name, "count": counts[name], "sources": sorted(sources.get(name, set()))} for name in sorted(counts)]


def risky_or_ambiguous_symbols(symbols: list[SymbolMetric], edges: list[CallEdge]) -> list[dict[str, object]]:
    low_edges: dict[str, list[CallEdge]] = {}
    for e in edges:
        if e.confidence == "low" or "multiple plausible" in e.reason:
            low_edges.setdefault(e.source, []).append(e)
    out: list[dict[str, object]] = []
    for s in symbols:
        reasons = []
        if s.changed:
            reasons.append("changed-root")
        if s.complexity >= 10:
            reasons.append("high-method-complexity")
        if s.boundary:
            reasons.append(f"external-boundary:{s.boundary}")
        if s.id in low_edges:
            reasons.append("low-confidence-or-ambiguous-call-resolution")
        if reasons:
            out.append({"symbol": s.id, "label": f"{s.class_name}.{s.name}", "file": s.path.as_posix(), "lineRange": {"start": s.start_line, "end": s.end_line}, "reasons": reasons})
    return out


def edge_payloads(edges: list[CallEdge]) -> list[dict[str, object]]:
    return [asdict(e) for e in edges]
