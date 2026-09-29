---
name: orchestrate
description: >-
  Implement a `to-agent-tasks` task set in parallel worktrees and commit each verified result to an integration branch.
disable-model-invocation: true
---

# Orchestrate an agent task set

## Workflow

1. Resolve the [inputs](#inputs) from the user's request, using the defaults for omitted values.
2. Run every [preflight check](references/preflight.md), resolving required input or reporting why the run stops.
3. [Prepare the run](references/run-workflow.md#prepare-the-run) and record every selected task in the initial `run.json`.
4. [Schedule the tasks](references/run-workflow.md#schedule-the-tasks) until every selected task has a final run status.
   - For each started task, follow [Run one task](references/run-workflow.md#run-one-task).
5. [Finish the run](references/run-workflow.md#finish-the-run) until cleanup and the chat summary are complete.

After preflight passes, continue implementation, verification, gap repair, and local integration through the final summary without review pauses.
A task with status `ended` blocks its dependents; continue independent tasks.
The user reviews the integration branch and merges it.

## Inputs

- Task directory: the directory the user names, or `action-items/agent-tasks/`.
- Range: two numeric task prefixes, such as `03 to 06`, or none.
- Concurrency limit: the largest number of tasks in progress at once, 3 by default.
  - A task is in progress while its subagent or verifier works.
- Pass limit: the number of verifier passes per task, 3 by default.

## Constraints

- Keep task results on the integration branch for the user to review and merge.
  - Never push, merge into the start branch, or run commands that change remote state.
- Preserve the start branch ref, index, and working tree, except task `state` writes and files in the run folder.
- Start subagents and write `run.json` and task `state` only from the orchestrator.
- Ask the user only during preflight, about invalid ranges or relevant changes in the start working tree.
  - Handle task stops, remaining gaps, and landing conflicts through [End a task](references/run-workflow.md#end-a-task).
