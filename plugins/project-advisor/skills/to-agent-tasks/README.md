# PRD to agent tasks

Turn an accepted `to-prd` `prd.yaml` bundle into autonomous Markdown implementation tasks in dependency order.

## Input and output

The source must have `status: Accepted`, or you must accept it in the conversation.
The skill reads `prd.yaml` as the source of truth and grounds each task in repository evidence.
It writes tasks to `action-items/agent-tasks/` by default:

```text
action-items/agent-tasks/
├── 01-short-task-title.md
├── 02-next-task-title.md
└── ...
```

One request runs source intake, repository inspection, writing, and audit.
Request breakdown review when you want a planning checkpoint.
Existing task files stay in place unless you ask for a regeneration.

## Task contents

- Each task defines one observable outcome.
- Each task states source behavior and acceptance checks.
- Each Boundary names what may change, what must be preserved, excluded work, open choices, assumptions, blockers, and prerequisites.
- Repository notes identify verified entry points and contracts that require more than a quick search.
- Dependencies state prerequisite capability contracts inline.
- Validation names local checks and expected evidence.

Every task carries the same executor boundary from `references/agent-task-template.md`.
It tells the executor to settle routine, reversible choices from repository evidence and record the material ones.
It stops the executor only at a decision that would change required behavior, a public or persisted contract, security, external state, or scope.

## Usage

```text
"Create coding agent tasks from the accepted prd.yaml"
"Turn this accepted PRD into autonomous implementation tasks"
"Show me the task breakdown before writing the files"
```

## References

- `references/agent-task-template.md` fixes the task file structure and the executor boundary text.
- `references/slice-design-checklist.md` settles how to split, combine, and order slices.
- `references/contract-precision.md` settles contract decisions for slices with contract risks.
- `references/task-writing-checklist.md` is the audit gate for the drafted set.

## Author

Daniel Hohner
