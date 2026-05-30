from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass
class JavaFileContext:
    path: Path
    package: str
    imports: dict[str, str]
    wildcard_imports: list[str]


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
    package: str = ""
    annotations: list[str] | None = None
    class_annotations: list[str] | None = None
    method_annotations: list[str] | None = None
    class_kind: str = "class"
    visibility: str = "package"
    implements: list[str] | None = None
    fqcn: str = ""
    imports: dict[str, str] | None = None
    wildcard_imports: list[str] | None = None
    call_targets: dict[str, str] | None = None


@dataclass(frozen=True)
class CallEdge:
    source: str
    target: str
    label: str = ""
    external: bool = False
    confidence: str = "medium"
    reason: str = ""
    resolved_fqcn: str | None = None
