---
name: orchestrate
description: >-
  Runs agent tasks in parallel worktrees and commits verified results to an integration branch.
disable-model-invocation: true
---

# Orchestrate an agent task set

Load references at the phase or condition below.
Read only the applicable host section and defer task references until a task starts.

## Workflow

1. Resolve the [inputs](#inputs) from the user's request, using the defaults for omitted values.
2. Before creating a run, read [capability requirements](references/agent-capabilities.md#platform-mechanisms).
   - Read [host mechanisms](references/host-mechanisms.md) for the current host, Claude Code, Codex, or Pi.
   - For unclear Pi setup, read [skills](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md) and the [subagent example](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/subagent).
   - Run every [preflight check](references/preflight.md), including the current host's agent capabilities.
   - Resolve every required input or report why the run stops.
   - For untested exposed capabilities, read [the waiting fixture](references/waiting-fixture.md) and [platform limits](references/user-questions.md#platform-limits) before testing.
3. After preflight passes, read [names and locations](references/run-cleanup.md#names-and-locations), [run recording](references/run-file.md), [HTML run report](references/run-report.md), and [preparation and scheduling](references/run-workflow.md).
   - Prepare the run and record every selected task in the initial `run.json`.
   - Create `report.html` beside `run.json` according to the report reference.
   - After every task status change, update `run.json`, then `report.html`, before scheduling or asking the user.
   - Initialize every task's `commit_message_source` to `null`, including skipped and not-started tasks.
   - Schedule the tasks until every selected task has a final run status.
   - If every task is skipped, proceed to cleanup and the summary.
4. Before starting a ready task, read [model and effort](references/agent-capabilities.md#model-and-effort), [agent prompts and instructions](references/prompts.md), and [task execution](references/task-execution.md).
   - Dispatch task agents with the task prompt and installed `implement` catalog name.
   - Before each verifier pass, read only the Canonical verifier prompt section of the installed `implement` entrypoint.
   - Fill that block's placeholders and add the verifier prefix from the prompts reference.
   - Handle replies and answers using the conditions below, then return to scheduling.
5. When scheduling completes, read [finish the run](references/run-cleanup.md#finish-the-run) and [chat summary](references/run-file.md#chat-summary).
   - After cleanup, refresh `report.html` from the final saved run file.
   - Include the report path in completed, stopped, and waiting summaries.
   - Finish when cleanup is complete, both run files reflect the final checkpoint, and the summary accounts for every selected task.

After preflight passes, continue implementation, verification, gap repair, and local integration through the final summary.
A task with status `ended` blocks its dependents; continue independent tasks.
The user reviews the integration branch and merges it.

## Replies and answers

- For decision stops or final verifier gaps, read [waiting and answers](references/task-waiting.md) and [user questions](references/user-questions.md#user-questions) before recording and asking.
  - Keep scheduling independent tasks during the wait.
  - Use the same waiting rules for clarification, continuation, acceptance, or ending.
- When verification reaches full coverage or the user accepts final gaps, read [commit and land](references/task-landing.md#commit-and-land).
  - For the message step, follow [task commit messages](#task-commit-messages).
  - After landing with `diagram_skill` nonnull, read [task change diagrams](references/task-diagrams.md) before generating the diagram.
- For landing conflicts, read [resolve a landing conflict](references/landing-conflicts.md) and [commit and land](references/task-landing.md#commit-and-land).
  - When a conflict requires a question, read [waiting and answers](references/task-waiting.md) and [user questions](references/user-questions.md#user-questions) before recording and asking.
  - Use the conflict procedure for resolution, validation, and accept, instruct, or end actions.
- For invalid replies, blocked coverage, landing failures without conflicts, or user requests to end, read [end a task](references/task-landing.md#end-a-task).
- For failed context resumption or scheduling during questions, read [platform limits](references/user-questions.md#platform-limits) before recording and reporting the failure.
  - Leave an unanswered task `waiting` and its task file `pending` when the session ends.

## Inputs

- Task directory: the directory the user names, or `action-items/agent-tasks/`.
- Range: two numeric task prefixes, such as `03 to 06`, or none.
- Concurrency limit: the largest number of tasks in progress at once, 3 by default.
  - A task is in progress during implementation, verification, conflict resolution, or validation.
  - A task waiting for a user answer frees its slot.
- Pass limit: the number of verifier passes per task, 3 by default.

## Constraints

- Keep task results on the integration branch for the user to review and merge.
  - Never push, merge into the start branch, or run commands that change remote state.
- Preserve the start branch ref, index, and working tree, except task `state` writes and files in the run folder.
- Start subagents and write `run.json`, `report.html`, and task `state` only from the orchestrator.
- During preflight, ask about invalid ranges or relevant changes in the start working tree.
  - During the run, ask about task stops and remaining gaps.
  - Route each answer to the original task subagent and preserve its context.

## Task commit messages

For task commits, amendments, and resolved conflict candidates, follow [message selection](references/task-commit-messages.md).
For staging, landing, failures, and cleanup, follow [commit and land](references/task-landing.md#commit-and-land).
For resolved conflict candidates, also follow [land the candidate](references/landing-conflicts.md#land-the-candidate).
When `gmsg` is missing, fails, times out, or returns blank stdout, apply [bundled message rules](references/commit-message-rules.md).
