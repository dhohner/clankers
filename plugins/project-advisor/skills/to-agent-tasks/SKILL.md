---
name: to-agent-tasks
description: >-                                                                               
  Turn an accepted `to-prd` `prd.yaml` into standalone Markdown tasks for an autonomous coding agent.
  For tracker tickets, use `to-issues`.
---

# Create agent tasks

Convert one accepted `prd.yaml` into Markdown tasks in dependency order.
Make each task executable without the PRD or sibling files.
Read `prd.yaml` as the source of truth, and treat `index.html` as its rendered copy for human review.
Write to `action-items/agent-tasks/` unless the user selects another destination.
Run intake, shaping, and writing in one pass, and stop only at the acceptance gate or a requested breakdown review.

## Accept the source

Require top level `status: Accepted` or acceptance from the user in the conversation.
Without either, ask for acceptance and write nothing.

Map every requirement, scenario, constraint, non goal, decision, risk, question, success measure, dependency, and validation link that affects implementation.
Take behavior from `blocks.requirements` and its validation context from `blocks.testing_strategy`.
Classify each item as implementation, validation, blocker, or no work.

Intake is complete when every source item has one disposition.

## Shape the tasks

Create the smallest set of outcome slices that covers the source.
Express each dependency as a required predecessor capability.
When a split, merge, or order is unclear, apply [references/slice-design-checklist.md](references/slice-design-checklist.md).
If the user requests breakdown review, present it before writing.

Ground each slice in verified entry points, contracts, conventions, and safe local validation from the repository.
Revise the slices when evidence reveals a coupling or sequence boundary.

Resolve decisions from the PRD first, then from repository evidence.
When a slice touches durable data, state, thresholds, time, retries, concurrency, coupled writes, external effects, authorization, or tenant isolation, resolve it with [references/contract-precision.md](references/contract-precision.md).
Delegate routine, reversible implementation choices to the executor.
Add a scoped blocker only when a missing decision would change required behavior, a public or persisted contract, security, external state, or scope.
Name the exact behavior each blocker prevents and leave the rest of the slice deliverable.

Shaping is complete when every source item maps to a grounded slice or a disposition, and every applicable contract check passes or has a blocker.

## Write the tasks

Follow [references/agent-task-template.md](references/agent-task-template.md) for every task file, including its executor boundary text.
Name files in dependency order, such as `01-short-task-title.md`.
Keep existing task files and choose unused names, unless the user asks for a regeneration, which replaces them.
State prerequisite contracts inline so each task stands alone.
Audit the task set against the source map and [references/task-writing-checklist.md](references/task-writing-checklist.md), fix every failure, and re-audit until it passes.

Writing is complete when all files exist, every task passes the audit, shared contracts agree, and each task has safe completion evidence.
Report the files in execution order with material assumptions and unresolved blockers.
