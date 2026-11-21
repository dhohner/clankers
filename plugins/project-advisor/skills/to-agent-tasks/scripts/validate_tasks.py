#!/usr/bin/env python3
"""Check the task files and the source map that `to-agent-tasks` writes.

Run it from the repository root:

    python3 <skill-dir>/scripts/validate_tasks.py <task-dir> --prd <prd.yaml>

The script runs in user repositories with whatever `python3` is installed, so it uses
only the standard library and must stay parseable and runnable by Python 3.9.
"""

from __future__ import annotations

import argparse
import re
import sys
from collections.abc import Collection, Iterable, Iterator, Sequence
from dataclasses import dataclass, field
from pathlib import Path

TASK_NAME = re.compile(r"^(\d{2,})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$")
SECTIONS = (
    "Outcome",
    "Required behavior",
    "Contract",
    "Boundary",
    "Repository notes",
    "Acceptance",
    "Validation",
)
OPTIONAL_SECTIONS = frozenset({"Contract"})
BOUNDARY_LABELS = (
    "May change",
    "Must preserve",
    "Out of scope",
    "Executor choices",
    "Assumptions",
    "Blockers",
    "Needs first",
)
REPEATABLE_LABELS = frozenset({"Needs first"})
# references/agent-task-template.md holds the same four lines; a test keeps them equal.
EXECUTOR_TEXT = (
    "Use repository evidence for routine, reversible implementation choices.",
    "Complete the task and its safe local validation.",
    "Record material choices.",
    (
        "Stop only when an unresolved decision would change required behavior, "
        "a public or persisted contract, security, external state, or scope."
    ),
)
STATES = ("pending", "done")
LIST_ITEM = re.compile(r"^\s*-\s+")
COVERAGE = re.compile(
    r"new[- ]behavior coverage|regression coverage|manual verification", re.IGNORECASE
)
# Template placeholders start with a capitalized word and a space, such as `<Task title>`,
# or with `NN-`. Command syntax such as `add <title>` stays lowercase and is not matched.
PLACEHOLDER = re.compile(r"<(?:NN-|[A-Z][A-Za-z-]* )[^>]*>?")
CODE_SPAN = re.compile(r"`[^`]*`")
FENCE = re.compile(r"^\s*(`{3,}|~{3,})(.*)$")
BULLET = re.compile(r"^[-*]\s+(.*)$")
NEEDS_FIRST = re.compile(r"^`?(\d+-[^`\s:]+\.md)`?(.*)$")
HEADING = re.compile(r"^(#{1,6})(?:\s|$)")
SHARED_HEADING = re.compile(r"^###\s+Shared:\s*(.*?)\s*$")

SOURCE_ID = re.compile(r"^(?:REQ|DEC|RISK|QUESTION|TEST|NODE)-[A-Z0-9][A-Z0-9-]*$", re.IGNORECASE)
PRD_ID_LINE = re.compile(r"""^\s*(?:-\s+)?id:\s*["']?([A-Za-z]+-[A-Za-z0-9-]+)["']?\s*(?:#.*)?$""")
# A line that opens a block scalar after a key, such as `- title: |-`, or after a list marker,
# such as `- |-`. Group 1 ends at the column of the key or of the last list marker.
BLOCK_SCALAR_LINE = re.compile(
    r"^(\s*(?:-\s+)*?)(?:(?:-\s+)|[^\s#-][^:]*:\s+)[|>][-+0-9]*\s*(?:#.*)?$"
)
PRD_SLUG_LINE = re.compile(
    r"""^slug:\s*["']?([a-z0-9]+(?:-[a-z0-9]+)*)["']?\s*(?:#.*)?$""", re.MULTILINE
)
MAP_HEADER = ("source item", "disposition", "tasks", "note")
MAP_SEPARATOR = re.compile(r"^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?$")
DISPOSITIONS = ("implementation", "validation", "blocker", "no work")
EMPTY_CELL = frozenset({"", "-", "—", "–", "none"})

NOT_UTF8 = "the file is not UTF-8 text"
NOT_CHECKED = (
    "not checked: evidence, prose, scope, and contract precision; "
    "audit them with references/task-writing-checklist.md"
)


@dataclass(frozen=True)
class Problem:
    path: Path
    line: int | None
    message: str

    def __str__(self) -> str:
        where = f"{self.path}:{self.line}" if self.line else str(self.path)
        return f"{where}: {self.message}"


@dataclass
class Task:
    path: Path
    prefix: int
    lines: list[str]
    problems: list[Problem] = field(default_factory=list)
    # Frontmatter and `depends_on` problems, which also matter for a kept predecessor.
    graph_problems: list[Problem] = field(default_factory=list)
    depends_on: list[tuple[int, str]] = field(default_factory=list)
    # The `state` value and its line, once the frontmatter is parsed.
    state: tuple[int, str] | None = None
    # Each section maps to its heading line and its lines as (number, text, fenced).
    sections: dict[str, tuple[int, list[tuple[int, str, bool]]]] = field(default_factory=dict)
    boundary: dict[str, list[tuple[int, str]]] = field(default_factory=dict)
    needs_first: list[tuple[int, str]] = field(default_factory=list)
    shared: dict[str, tuple[int, str]] = field(default_factory=dict)

    @property
    def name(self) -> str:
        return self.path.name

    def report(self, line: int | None, message: str) -> None:
        self.problems.append(Problem(self.path, line, message))

    def report_graph(self, line: int | None, message: str) -> None:
        self.graph_problems.append(Problem(self.path, line, message))

    def dependency_names(self) -> list[str]:
        return [name for _, name in self.depends_on]


def unquote(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    return value


def leading_space(line: str) -> str:
    return line[: len(line) - len(line.lstrip())]


def read_utf8(path: Path) -> str | None:
    """Return the text of `path`, or None when it is not UTF-8."""
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return None


def read_task(path: Path, prefix: int) -> Task:
    text = read_utf8(path)
    if text is None:
        task = Task(path=path, prefix=prefix, lines=[])
        task.report_graph(None, NOT_UTF8)
        return task
    task = Task(path=path, prefix=prefix, lines=text.splitlines())
    body_start = parse_frontmatter(task)
    if body_start is None:
        return task
    parse_body(task, body_start)
    check_boundary(task)
    check_contract(task)
    check_validation(task)
    return task


def parse_frontmatter(task: Task) -> int | None:
    """Parse the template's frontmatter form, and return the index of the first body line."""
    lines = task.lines
    if not lines or lines[0] != "---":
        task.report_graph(1, "line 1 must be `---`, the start of the frontmatter block")
        return 0
    try:
        close = lines.index("---", 1)
    except ValueError:
        task.report_graph(1, "the frontmatter block has no closing `---` line")
        return None

    seen = set()
    index = 1
    while index < close:
        line = lines[index]
        number = index + 1
        index += 1
        if not line.strip():
            continue
        key, separator, value = line.partition(":")
        key = key.strip()
        if line[:1].isspace() or not separator or key not in ("depends_on", "state"):
            task.report_graph(number, "frontmatter holds only the keys `depends_on` and `state`")
            continue
        if key in seen:
            task.report_graph(number, f"frontmatter repeats `{key}`")
            continue
        seen.add(key)
        if value and not value[:1].isspace():
            # YAML reads `state:pending` as one plain scalar, not as a key and a value.
            task.report_graph(number, f"put a space between `{key}:` and its value")
            continue
        value = value.strip()
        if key == "state":
            state = unquote(value)
            if state not in STATES:
                task.report_graph(number, "`state` must be `pending` or `done`")
            task.state = (number, state)
            continue
        if value.startswith("[") and value.endswith("]"):
            inner = value[1:-1].strip()
            if inner:
                task.depends_on.extend((number, unquote(part)) for part in inner.split(","))
            continue
        if value:
            task.report_graph(number, "`depends_on` must be a YAML list")
            continue
        start = len(task.depends_on)
        item_indent = None
        while index < close and LIST_ITEM.match(lines[index]):
            indent = leading_space(lines[index])
            if "\t" in indent:
                task.report_graph(index + 1, "indent frontmatter with spaces, not tabs")
            elif item_indent is None:
                item_indent = indent
            elif indent != item_indent:
                # YAML would fold a deeper item into the previous file name.
                task.report_graph(index + 1, "indent each `depends_on` item like the first")
            item = lines[index].strip()[1:]
            task.depends_on.append((index + 1, unquote(item)))
            index += 1
        if len(task.depends_on) == start:
            task.report_graph(number, "write `depends_on: []` for a task without predecessors")

    for key in ("depends_on", "state"):
        if key not in seen:
            task.report_graph(1, f"frontmatter lacks `{key}`")
    return close + 1


def code_lines(lines: Iterable[str]) -> Iterator[bool]:
    """Yield, for each line, whether it opens, holds, or closes a fenced code block."""
    opening = None
    for line in lines:
        match = FENCE.match(line)
        if opening is None:
            if match:
                opening = match.group(1)
            yield bool(match)
            continue
        # Only a fence of the same marker, at least as long and without an info string, closes.
        marker = match.group(1) if match else ""
        if marker[:1] == opening[0] and len(marker) >= len(opening) and not match.group(2).strip():
            opening = None
        yield True


def parse_body(task: Task, start: int) -> None:
    current: list[tuple[int, str, bool]] | None = None
    titles = 0
    seen_content = False
    body = task.lines[start:]
    for number, (line, code) in enumerate(zip(body, code_lines(body)), start + 1):
        if code:
            if current is not None:
                current.append((number, line, True))
            continue

        if not seen_content and line.strip():
            seen_content = True
            if not line.startswith("# "):
                task.report(number, "the `# <Task title>` heading must follow the frontmatter")
        match = PLACEHOLDER.search(CODE_SPAN.sub("", line))
        if match:
            task.report(number, f"template placeholder left in place: {match.group(0)}")

        if line.startswith("# "):
            titles += 1
            if titles > 1:
                task.report(number, "a task has one `# ` title")
            continue
        if line.startswith("## "):
            name = line[3:].strip()
            current = None
            if name not in SECTIONS:
                task.report(number, f"unknown section `## {name}`")
            elif name in task.sections:
                task.report(number, f"section `## {name}` appears twice")
            else:
                current = []
                task.sections[name] = (number, current)
            continue
        if current is not None:
            current.append((number, line, False))

    if titles == 0:
        task.report(None, "the task has no `# ` title")
    check_sections(task)


def check_sections(task: Task) -> None:
    positions = [
        (heading, SECTIONS.index(name), name) for name, (heading, _) in task.sections.items()
    ]
    positions.sort()
    for (_, earlier, earlier_name), (heading, later, name) in zip(positions, positions[1:]):
        if later < earlier:
            task.report(heading, f"section `## {name}` must come before `## {earlier_name}`")
    for name in SECTIONS:
        if name not in task.sections:
            if name not in OPTIONAL_SECTIONS:
                task.report(None, f"required section `## {name}` is missing")
            continue
        heading, lines = task.sections[name]
        if not any(text.strip() for _, text, _ in lines):
            task.report(heading, f"section `## {name}` is empty")


def is_prose(text: str, fenced: bool) -> bool:
    """Return whether a section line is unindented text outside a bullet and a fence."""
    return not fenced and bool(text.strip()) and not text[:1].isspace() and not BULLET.match(text)


def bullets(lines: Sequence[tuple[int, str, bool]]) -> list[tuple[int, str]]:
    """Return each top-level bullet with its indented continuation lines joined."""
    result: list[tuple[int, str]] = []
    for number, text, fenced in lines:
        if fenced or not text.strip():
            continue
        match = BULLET.match(text)
        if match:
            result.append((number, match.group(1)))
        elif text[:1].isspace() and result:
            result[-1] = (result[-1][0], result[-1][1] + " " + text.strip())
    return result


def find_run(lines: Sequence[str], run: tuple[str, ...]) -> int | None:
    """Return the index where `run` starts as consecutive items of `lines`, if it does."""
    size = len(run)
    return next(
        (i for i in range(len(lines) - size + 1) if tuple(lines[i : i + size]) == run), None
    )


def check_boundary(task: Task) -> None:
    if "Boundary" not in task.sections:
        return
    heading, lines = task.sections["Boundary"]
    prose = [(number, text.rstrip()) for number, text, fenced in lines if is_prose(text, fenced)]

    for number, text in bullets(lines):
        label, separator, value = text.partition(":")
        label = label.strip()
        if not separator or label not in BOUNDARY_LABELS:
            task.report(number, "Boundary lines start with one of: " + ", ".join(BOUNDARY_LABELS))
            continue
        if label in task.boundary and label not in REPEATABLE_LABELS:
            task.report(number, f"Boundary repeats `{label}`")
            continue
        if not value.strip():
            task.report(number, f"`{label}` is empty; remove the line when it does not apply")
            continue
        task.boundary.setdefault(label, []).append((number, value.strip()))

    size = len(EXECUTOR_TEXT)
    start = find_run([text for _, text in prose], EXECUTOR_TEXT)
    if start is None:
        task.report(
            heading,
            "Boundary lacks the executor text from references/agent-task-template.md, "
            "or the text was changed",
        )
        start = len(prose)
    for number, _ in prose[:start] + prose[start + size :]:
        task.report(number, "Boundary holds only labelled lines and the executor text")

    for number, value in task.boundary.get("Needs first", []):
        match = NEEDS_FIRST.match(value)
        if not match:
            task.report(
                number,
                "start each `Needs first` line with the predecessor file name, "
                "such as `01-short-task-title.md`",
            )
            continue
        if not match.group(2).strip(" :;,.-—–"):
            task.report(number, "`Needs first` names no prerequisite capability contract")
        task.needs_first.append((number, match.group(1)))


def check_contract(task: Task) -> None:
    for name, (_, lines) in task.sections.items():
        if name == "Contract":
            continue
        for number, text, fenced in lines:
            if not fenced and SHARED_HEADING.match(text):
                task.report(number, "`### Shared:` blocks belong under `## Contract`")
    if "Contract" not in task.sections:
        return

    current: str | None = None
    blocks: dict[str, tuple[int, list[str]]] = {}
    for number, text, fenced in task.sections["Contract"][1]:
        heading = None if fenced else HEADING.match(text)
        # A deeper heading, such as `####`, sits inside the shared block and belongs to it.
        if heading and len(heading.group(1)) <= 3:
            match = SHARED_HEADING.match(text)
            current = None
            if not match:
                continue
            name = match.group(1)
            if not name:
                task.report(number, "a `### Shared:` heading needs a contract name")
            elif name in blocks:
                task.report(number, f"shared contract `{name}` appears twice")
            else:
                current = name
                blocks[name] = (number, [])
            continue
        if current is not None:
            blocks[current][1].append(text.rstrip())

    for name, (number, lines) in blocks.items():
        body = "\n".join(lines).strip("\n")
        if not body.strip():
            task.report(number, f"shared contract `{name}` is empty")
            continue
        task.shared[name] = (number, body)


def check_validation(task: Task) -> None:
    if "Validation" not in task.sections:
        return
    heading, lines = task.sections["Validation"]
    checks = bullets(lines)
    # A fenced command may supplement a check, but the check itself is a bullet.
    if not checks:
        task.report(heading, "`## Validation` lists no check as a bullet")
    for number, text, fenced in lines:
        if is_prose(text, fenced):
            task.report(
                number, "write each Validation check as a bullet that names its coverage type"
            )
    for number, text in checks:
        if not COVERAGE.search(text):
            task.report(
                number,
                "name the coverage type: new-behavior coverage, regression coverage, "
                "or manual verification",
            )


def ancestors(names: Iterable[str], tasks: dict[str, Task]) -> set[str]:
    """Return the named tasks and every task they need, walking each task once."""
    seen = set()
    pending = list(names)
    while pending:
        name = pending.pop()
        if name in seen or name not in tasks:
            continue
        seen.add(name)
        pending.extend(tasks[name].dependency_names())
    return seen


def check_edges(task: Task, tasks: dict[str, Task], task_dir: Path) -> dict[str, int]:
    """Report each `depends_on` entry that names no earlier task, and return the entries."""
    listed: dict[str, int] = {}
    for number, dependency in task.depends_on:
        if dependency in listed:
            task.report_graph(number, f"`depends_on` repeats {dependency}")
            continue
        listed[dependency] = number
        if "/" in dependency or "\\" in dependency:
            task.report_graph(number, f"`depends_on` entry {dependency} must be a bare file name")
        elif not TASK_NAME.match(dependency):
            task.report_graph(number, f"`depends_on` entry {dependency} is not a task file name")
        elif dependency not in tasks:
            message = f"`depends_on` entry {dependency} does not exist in {task_dir}"
            task.report_graph(number, message)
        elif tasks[dependency].prefix >= task.prefix:
            message = f"`depends_on` entry {dependency} needs a lower numeric prefix"
            task.report_graph(number, message)
    return listed


def check_dependencies(task: Task, tasks: dict[str, Task], task_dir: Path) -> None:
    listed = check_edges(task, tasks, task_dir)
    needed = set()
    for number, name in task.needs_first:
        if name in needed:
            task.report(number, f"a second `Needs first` line names {name}; give it one line")
            continue
        needed.add(name)
        if name not in listed:
            task.report(number, f"`Needs first` names {name}, which `depends_on` does not list")
    for dependency, number in listed.items():
        if dependency not in needed:
            task.report(
                number, f"`depends_on` lists {dependency}, but no `Needs first` line names it"
            )

    present = [name for name in listed if name in tasks]
    # One predecessor cannot be redundant, and skipping the walk keeps a long chain linear.
    if len(present) < 2:
        return
    required = {name: ancestors(tasks[name].dependency_names(), tasks) for name in present}
    for dependency in present:
        for other in present:
            if other != dependency and dependency in required[other]:
                task.report(
                    listed[dependency],
                    f"`depends_on` lists {dependency}, which {other} already requires; "
                    "list only direct predecessors",
                )
                break


def check_shared_contracts(
    tasks: dict[str, Task], chosen: Iterable[str], prd_set: Collection[str]
) -> list[Problem]:
    """Report each chosen task whose copy of a shared contract differs from a binding copy.

    Another PRD may give a contract the same name, so a chosen task is bound only by the tasks
    of this PRD, `prd_set`, and by the tasks it needs. A conflict names the lowest-numbered copy.
    """
    problems = []
    for task in (tasks[name] for name in chosen):
        if not task.shared:
            continue
        peers = sorted(
            (tasks[name] for name in ancestors(task.dependency_names(), tasks).union(prd_set)),
            key=lambda item: (item.prefix, item.name),
        )
        for contract, (number, body) in task.shared.items():
            other = next(
                (
                    peer
                    for peer in peers
                    if contract in peer.shared and peer.shared[contract][1] != body
                ),
                None,
            )
            if other:
                message = f"shared contract `{contract}` differs from the copy in {other.name}"
                problems.append(Problem(task.path, number, message))
    return problems


def table_cells(line: str) -> list[str]:
    stripped = line.strip()
    stripped = stripped.removeprefix("|")
    if stripped.endswith("|") and not stripped.endswith("\\|"):
        stripped = stripped[:-1]
    return [cell.strip() for cell in re.split(r"(?<!\\)\|", stripped)]


def is_empty_cell(cell: str) -> bool:
    return cell.strip("` ").lower() in EMPTY_CELL


def task_names(cell: str) -> list[str]:
    if is_empty_cell(cell):
        return []
    return [part.strip("`") for part in re.split(r"[,\s]+", cell) if part.strip("`")]


def prd_ids(text: str) -> dict[str, None]:
    """Return the source ids of the PRD in order, skipping the text of block scalars."""
    # A dict keeps the unique ids in PRD order.
    ids: dict[str, None] = {}
    scalar_indent: int | None = None
    for line in text.splitlines():
        indent = len(leading_space(line))
        if scalar_indent is not None:
            if not line.strip() or indent > scalar_indent:
                continue
            scalar_indent = None
        scalar = BLOCK_SCALAR_LINE.match(line)
        if scalar:
            # The text is indented past the node that holds it: the key, or the list marker.
            scalar_indent = len(scalar.group(1))
            continue
        match = PRD_ID_LINE.match(line)
        if match and SOURCE_ID.match(match.group(1)):
            ids[match.group(1).upper()] = None
    return ids


def check_source_map(
    task_dir: Path, prd: Path, tasks: dict[str, Task], chosen: Iterable[str]
) -> tuple[list[Problem], int, set]:
    """Return the problems, the number of source items, and the task files the map names."""
    text = read_utf8(prd)
    if text is None:
        return [Problem(prd, None, NOT_UTF8)], 0, set()
    slug = PRD_SLUG_LINE.search(text)
    if not slug:
        message = "the PRD has no `slug`, so the source map has no name"
        return [Problem(prd, None, message)], 0, set()
    ids = prd_ids(text)

    path = task_dir / f"source-map-{slug.group(1)}.md"
    if not path.is_file():
        message = "the source map does not exist; write it as references/source-map.md describes"
        return [Problem(path, None, message)], 0, set()

    problems: list[Problem] = []

    def report(line: int | None, message: str) -> None:
        problems.append(Problem(path, line, message))

    text = read_utf8(path)
    if text is None:
        report(None, NOT_UTF8)
        return problems, 0, set()
    lines = text.splitlines()
    # A table inside a code fence renders as code, not as a table.
    rows = [
        (number, line)
        for number, (line, code) in enumerate(zip(lines, code_lines(lines)), 1)
        if not code and line.lstrip().startswith("|")
    ]
    if len(rows) < 2:
        report(None, "the source map has no table")
        return problems, 0, set()
    header_line, header = rows[0]
    if tuple(cell.lower() for cell in table_cells(header)) != MAP_HEADER:
        report(
            header_line, "the table header must be `| Source item | Disposition | Tasks | Note |`"
        )
        return problems, 0, set()
    separator_line, separator = rows[1]
    if (
        separator_line != header_line + 1
        or not MAP_SEPARATOR.match(separator.strip())
        or len(table_cells(separator)) != len(MAP_HEADER)
    ):
        report(header_line + 1, "the header must be followed by a `|---|` separator row")

    items: dict[str, int] = {}
    named = set()
    previous = separator_line
    for number, line in rows[2:]:
        # A blank line or another block ends a Markdown table, so a later row renders apart.
        if number != previous + 1:
            report(
                number, "this row is outside the table, because the line above it ends the table"
            )
        previous = number
        cells = table_cells(line)
        if len(cells) != len(MAP_HEADER):
            report(number, f"a row has {len(MAP_HEADER)} cells")
            continue
        item, disposition, task_cell, note = cells
        item = item.strip("`").strip()
        if not item:
            report(number, "the `Source item` cell is empty")
            continue
        is_id = bool(SOURCE_ID.match(item))
        key = item.upper() if is_id else item
        if key in items:
            report(number, f"{item} already has a row on line {items[key]}")
            continue
        items[key] = number
        if is_id and key not in ids:
            report(number, f"{item} is not an `id` in {prd}")

        disposition = disposition.strip("`").strip().lower()
        if disposition not in DISPOSITIONS:
            report(number, f"{item}: disposition must be one of: " + ", ".join(DISPOSITIONS))
            continue
        names = task_names(task_cell)
        for name in names:
            if name not in tasks:
                report(number, f"{item}: {name} is not a task file in {task_dir}")
                continue
            named.add(name)
            if disposition == "blocker" and "Blockers" not in tasks[name].boundary:
                report(number, f"{item}: {name} has no `Blockers` line")
        if disposition in ("implementation", "validation") and not names:
            report(number, f"{item}: an {disposition} item names at least one task")
        if disposition in ("blocker", "no work") and is_empty_cell(note):
            report(number, f"{item}: give the reason for `{disposition}` in the Note cell")

    for source_id in ids:
        if source_id not in items:
            report(None, f"{source_id} from {prd} has no row")
    for name in chosen:
        if name in tasks and name not in named:
            problems.append(
                Problem(tasks[name].path, None, f"no row in {path.name} names this task")
            )
    return problems, len(items), named


def check(
    task_dir: Path, prd: Path, files: Sequence[str] | None = None
) -> tuple[list[Problem], int, int]:
    """Return the problems, the number of checked task files, and the number of source items."""
    problems: list[Problem] = []
    names = sorted(
        path.name for path in task_dir.iterdir() if path.is_file() and path.suffix == ".md"
    )
    tasks: dict[str, Task] = {}
    for name in names:
        match = TASK_NAME.match(name)
        if match:
            tasks[name] = read_task(task_dir / name, int(match.group(1)))

    # An empty selection, unlike an omitted one, audits the source map when this run wrote
    # no task, so that kept tasks may stay done.
    # A dict keeps the chosen names unique and in the order given.
    chosen: dict[str, None] = {}
    if files is not None:
        for name in files:
            name = Path(name).name
            if name not in tasks:
                problems.append(
                    Problem(
                        task_dir / name, None, "not a task file named like 01-short-task-title.md"
                    )
                )
            else:
                chosen[name] = None
    else:
        chosen = dict.fromkeys(tasks)
        for name in names:
            if name[:1].isdigit() and name not in tasks:
                problems.append(
                    Problem(
                        task_dir / name, None, "task files are named like 01-short-task-title.md"
                    )
                )
        if not chosen:
            problems.append(Problem(task_dir, None, "the directory holds no task files"))

    prefixes: dict[int, list[str]] = {}
    for task in tasks.values():
        prefixes.setdefault(task.prefix, []).append(task.name)
    # Only chosen tasks report problems, but every task file feeds the dependency graph.
    for name in chosen:
        task = tasks[name]
        others = [other for other in prefixes[task.prefix] if other != name]
        if others:
            task.report(None, f"numeric prefix is also used by {', '.join(others)}")
        # Only the tool that implements a task sets `done`, so a task just written is pending.
        if task.state and task.state[1] == "done":
            task.report(task.state[0], "a task written in this run has `state: pending`")
        check_dependencies(task, tasks, task_dir)
        problems.extend(task.graph_problems)
        problems.extend(task.problems)

    # A runner schedules a chosen task only through intact predecessors, so check the graph
    # of each kept predecessor, but not its prose, which an earlier run already audited.
    roots = [dependency for name in chosen for dependency in tasks[name].dependency_names()]
    for name in sorted(ancestors(roots, tasks).difference(chosen)):
        check_edges(tasks[name], tasks, task_dir)
        problems.extend(tasks[name].graph_problems)

    map_problems, items, mapped = check_source_map(task_dir, prd, tasks, chosen)
    # This PRD's tasks are the tasks of this run and the kept tasks that its source map names.
    problems.extend(check_shared_contracts(tasks, chosen, mapped.union(chosen)))
    problems.extend(map_problems)
    return problems, len(chosen), items


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="validate_tasks.py",
        description="Check to-agent-tasks task files and their source map.",
        epilog=NOT_CHECKED + ".",
    )
    parser.add_argument(
        "task_dir", type=Path, help="the task directory, such as action-items/agent-tasks"
    )
    parser.add_argument(
        "--prd", type=Path, required=True, help="the accepted prd.yaml the tasks come from"
    )
    parser.add_argument(
        "--files",
        nargs="*",
        metavar="NAME",
        help="the task files written in this run, which must be pending, beside kept task "
        "files; give no names when the run wrote none; without the option, every task file "
        "counts as written in this run",
    )
    args = parser.parse_args(argv)
    if not args.task_dir.is_dir():
        parser.error(f"{args.task_dir} is not a directory")
    if not args.prd.is_file():
        parser.error(f"{args.prd} is not a file")

    problems, checked, items = check(args.task_dir, args.prd, args.files)
    for problem in problems:
        print(problem)
    if problems:
        print(f"failed: {len(problems)} problem(s)")
    else:
        print(f"ok: {checked} task file(s) and {items} source item(s)")
    print(NOT_CHECKED)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
