---
name: to-agent-tasks
description: >-
  Turn an accepted `to-prd` `prd.yaml` into standalone Markdown tasks for an autonomous coding agent.
  For tracker tickets, use `to-issues`.
---

# Create agent tasks

Convert one accepted `prd.yaml` into standalone Markdown tasks in dependency order: each task executes without the PRD or sibling files.
Read `prd.yaml` as the source of truth, and treat `index.html` as its rendered copy for human review.
Write to `action-items/agent-tasks/` unless the user selects another destination.
Run intake, shaping, writing, and audit in one pass.
Stop only at the acceptance gate, at a gap in the accepted PRD, or at a requested breakdown review.

## Accept the source

Require top level `status: Accepted` or acceptance from the user in the conversation.
Without either, ask for acceptance and write nothing.

Map every requirement, scenario, constraint, non goal, decision, design tree node, risk, question, success measure, dependency, and validation link that affects implementation.
Take behavior from `blocks.requirements` and its validation context from `blocks.testing_strategy`.
Classify each item as implementation, validation, blocker, or no work.
Record the map as [references/source-map.md](references/source-map.md) describes, and fill its `Tasks` cells when you write the tasks.

Intake is complete when every source item has one row with one disposition.

## Shape the tasks

Create the smallest set of outcome slices that covers the source.
Express each dependency as a required predecessor capability.
When a split, merge, or order is unclear, apply [references/slice-design-checklist.md](references/slice-design-checklist.md).
If the user requests breakdown review, present it before writing.

Ground each slice in verified entry points, contracts, conventions, and safe local validation from the repository.
Revise the slices when evidence reveals a coupling or sequence boundary.
Check that each tool a validation command needs is installed, such as with `command -v <tool>` or its version flag.

Resolve decisions from the PRD first, then from repository evidence.
When a slice touches durable data, state, thresholds, time, retries, concurrency, coupled writes, external effects, authorization, or tenant isolation, it has contract risks: resolve them with [references/contract-precision.md](references/contract-precision.md).
Delegate routine, reversible implementation choices to the executor.

A decision is material when it would change required behavior, a public or persisted contract, security, external state, or scope.
A material decision that neither the PRD nor the repository settles is a gap in the accepted PRD.
Only the acceptance gate settles a gap, so a task never settles one, not even as an assumption.
Collect the gaps during shaping, and ask the user once, before writing, how to handle each one:

- Revise the PRD with `to-prd`, so the decision passes the acceptance gate, and continue from the revised `prd.yaml`.
- Keep the decision open as a scoped blocker.

When nobody can answer in this session, keep each gap as a scoped blocker, and report it as a candidate for a PRD revision.
Name the exact behavior each blocker prevents and leave the rest of the slice deliverable.

Shaping is complete when every source item maps to a grounded slice or a disposition, every contract risk is resolved or has a blocker, and every gap has the user's choice, or a scoped blocker when nobody can answer in this session.

## Write the tasks

Follow [references/agent-task-template.md](references/agent-task-template.md) for every task file.
Name files in dependency order, such as `01-short-task-title.md`.
Keep existing task files and choose unused names, unless the user asks for a regeneration, which replaces them.

State prerequisite contracts inline, including those from indirect predecessors, so each task stays standalone.
Put each decision in one place:

- Required behavior or Contract holds a decision that the PRD or repository evidence supports.
- Executor choices holds only routine, reversible choices that the source and repository leave open.
- Assumptions holds only a fact that nobody could verify, or a minor task decision without source evidence, and never a material decision.
- Blockers holds a gap that the user chose to keep open.

Writing is complete when every source map row names the tasks that carry it and every slice has its task file.

## Audit the tasks

`<skill-dir>` is the directory that holds this `SKILL.md`.
In an installed plugin, it is in the plugin cache and not in the user repository.
Run the validator from the repository root with Python 3.9 or newer:

```sh
python3 <skill-dir>/scripts/validate_tasks.py <destination> --prd <prd.yaml>
```

When the destination keeps task files from an earlier run, of this PRD or another, add `--files` with the task file names of this run.
The validator requires `state: pending` for those files, checks the frontmatter and `depends_on` entries of the kept predecessors they reach, and compares shared contracts among them and the kept tasks that the source map names, and with each kept predecessor of another PRD only for the tasks that need it.
When this run writes no task file, add `--files` without names, so the validator checks the source map and leaves kept tasks as they are.

Fix every failure until the validator passes.
Then read each task file against every item of [references/task-writing-checklist.md](references/task-writing-checklist.md).
Run the validator again after each fix.

Audit is complete when the validator passes and you have read every task file against every checklist item.
Report the files in execution order, the source map path, the validator result, material assumptions, missing tools, and unresolved blockers.
