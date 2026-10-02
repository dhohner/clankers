---
name: orchestrate
description: >-
  Implement a `to-agent-tasks` task set in parallel worktrees and commit each verified result to an integration branch.
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
3. After preflight passes, read [names and locations](references/run-cleanup.md#names-and-locations), [run recording](references/run-file.md), and [preparation and scheduling](references/run-workflow.md).
   - Prepare the run and record every selected task in the initial `run.json`.
   - Schedule the tasks until every selected task has a final run status.
   - If every task is skipped, proceed to cleanup and the summary.
4. Before starting a ready task, read [model and effort](references/agent-capabilities.md#model-and-effort), [agent prompts and instructions](references/prompts.md), and [task execution](references/task-execution.md).
   - Resolve `<implement skill file>` to `../implement/SKILL.md` from this skill directory before filling prompts.
   - Before each verifier pass, read the canonical prompt in [Verify requirement coverage](../implement/references/normal-mode.md#verify-requirement-coverage).
   - Copy that code block unchanged into the verifier prompt and fill its placeholders.
   - Handle replies and answers using the conditions below, then return to scheduling.
5. When scheduling completes, read [finish the run](references/run-cleanup.md#finish-the-run) and [chat summary](references/run-file.md#chat-summary).
   - Continue until cleanup and the chat summary are complete.

After preflight passes, continue implementation, verification, gap repair, and local integration through the final summary.
A task with status `ended` blocks its dependents; continue independent tasks.
The user reviews the integration branch and merges it.

## Replies and answers

- For decision stops or final verifier gaps, read [waiting and answers](references/task-waiting.md) and [user questions](references/user-questions.md#user-questions) before recording and asking.
  - Keep scheduling independent tasks during the wait.
  - Use the same waiting rules for clarification, continuation, acceptance, or ending.
- When verification reaches full coverage or the user accepts final gaps, read [commit and land](references/task-landing.md#commit-and-land).
- For invalid replies, blocked coverage, failed landing, or user requests to end, read [end a task](references/task-landing.md#end-a-task).
- For failed context resumption or scheduling during questions, read [platform limits](references/user-questions.md#platform-limits) before recording and reporting the failure.
  - Leave an unanswered task `waiting` and its task file `pending` when the session ends.

## Inputs

- Task directory: the directory the user names, or `action-items/agent-tasks/`.
- Range: two numeric task prefixes, such as `03 to 06`, or none.
- Concurrency limit: the largest number of tasks in progress at once, 3 by default.
  - A task is in progress while its subagent or verifier works.
  - A task waiting for a user answer frees its slot.
- Pass limit: the number of verifier passes per task, 3 by default.

## Constraints

- Keep task results on the integration branch for the user to review and merge.
  - Never push, merge into the start branch, or run commands that change remote state.
- Preserve the start branch ref, index, and working tree, except task `state` writes and files in the run folder.
- Start subagents and write `run.json` and task `state` only from the orchestrator.
- During preflight, ask about invalid ranges or relevant changes in the start working tree.
  - During the run, ask about task stops and remaining gaps.
  - Route each answer to the original task subagent and preserve its context.
