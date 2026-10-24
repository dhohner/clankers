> This repository contains generated distribution files.
> For development instructions, tests, and contributions, use [clankers-dev](https://github.com/dhohner/clankers-dev).

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
└── ...
```

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
The skill writes only `state: pending`, and a tool that implements the task sets `state: done`.
A runner can read the frontmatter to plan parallel work and skip finished tasks.

One request runs source intake, repository inspection, writing, and audit.
Request breakdown review when you want a planning checkpoint.
Existing task files stay in place unless you ask for a regeneration.

## Task contents

- Each task defines one observable outcome.
- Each task states source behavior and acceptance checks.
- Each task's Boundary section names what may change, what must be preserved, excluded work, open choices, assumptions, blockers, and prerequisites.
- Repository notes identify verified entry points and contracts that require more than a quick search.
- Dependencies state prerequisite capability contracts inline, and `depends_on` names the tasks that provide them.
- Validation names local checks and expected evidence.

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
- `references/task-writing-checklist.md` lists the checks required to audit the drafted tasks.

## Author

Daniel Hohner
