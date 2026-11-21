# PRD to agent tasks

Turn an accepted `to-prd` `prd.yaml` bundle into Markdown implementation tasks that agents can execute autonomously, in dependency order.

## Input and output

The source must have `status: Accepted`, or you must accept it in the conversation.
The skill uses `prd.yaml` as the authoritative source and checks repository evidence for each task.
It writes tasks to `action-items/agent-tasks/` by default:

```text
action-items/agent-tasks/
├── 01-short-task-title.md
├── 02-next-task-title.md
├── ...
└── source-map-<prd-slug>.md
```

Task files are the files with a numeric prefix.
The source map records one disposition for every PRD item, such as implementation, validation, blocker, or no work, and names the tasks that carry it.

Each task file starts with YAML frontmatter that lists its predecessor task files and its implementation state:

```markdown
---
depends_on:
  - 01-short-task-title.md
state: pending
---

# Next task title
```

The first task of a chain has `depends_on: []`.
`depends_on` lists only direct predecessors, and each one has a `Needs first` line that starts with its file name.
A task that a listed predecessor already requires is left out, because a runner follows the chain.
The skill writes only `state: pending`, and a tool that implements the task sets `state: done`.
A runner can read the frontmatter to plan parallel work and skip finished tasks.

One request runs source intake, repository inspection, writing, and audit.
When a decision that changes behavior, a contract, security, external state, or scope is missing from the accepted PRD, the skill asks once before writing.
You choose a PRD revision through `to-prd` or a scoped blocker, so such a decision never enters a task as an assumption.
Request breakdown review when you want a planning checkpoint.
Existing task files stay in place unless you ask for a regeneration.

## Task contents

- Each task defines one observable outcome.
- Each task states source behavior and acceptance checks.
- Each task's Boundary section names what may change, what must be preserved, excluded work, open choices, assumptions, blockers, and prerequisites.
- Repository notes identify verified entry points and contracts that require more than a quick search.
- Dependencies state prerequisite capability contracts inline, and `depends_on` names the tasks that provide them.
- A contract that several tasks state appears in each of them as an identical `### Shared: <name>` block.
- Validation names local checks, expected evidence, and the coverage type, and it names any tool that is not installed.

## Validator

The skill checks its output with a bundled validator that needs Python 3.9 or newer and no packages:

```sh
python3 <skill-dir>/scripts/validate_tasks.py action-items/agent-tasks --prd action-items/PRD-<slug>/prd.yaml
```

It checks file names, frontmatter, `depends_on` edges against the `Needs first` lines, sections, the executor text, leftover placeholders, coverage types, shared contract copies, and the source map.
`--files` names the task files written in this run, when the directory keeps task files from an earlier run.
The validator audits only those files and requires `state: pending` for them.
Of the kept tasks, it checks only the frontmatter and `depends_on` entries of the predecessors that those files reach.
It compares the shared contracts of those files with every copy among them and the kept tasks that the source map names.
A kept predecessor of another PRD binds only the files that need it, directly or through other tasks.
`--files` without names checks only the source map, for a run that writes no task file.
It does not judge evidence, prose, scope, or contract precision; the skill audits those against `references/task-writing-checklist.md`.

Every task includes the executor rules from `references/agent-task-template.md`.
The executor uses repository evidence to settle routine, reversible choices and records material choices.
It asks the user only when a decision would change required behavior, a public or persisted contract, security, external state, or scope.

## Usage

```text
"Create coding agent tasks from the accepted prd.yaml"
"Turn this accepted PRD into autonomous implementation tasks"
"Show me the task breakdown before writing the files"
```

## References

- `references/agent-task-template.md` fixes the task file structure and the executor boundary text.
- `references/slice-design-checklist.md` defines how to split, combine, and order slices.
- `references/contract-precision.md` guides contract decisions for slices that could affect contracts.
- `references/task-writing-checklist.md` lists the checks that the skill audits by reading the drafted tasks.
- `references/source-map.md` defines the source map format.

## Author

Daniel Hohner
