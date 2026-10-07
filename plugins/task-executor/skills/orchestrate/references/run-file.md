# Run file and chat summary

## Contents

- [Run statuses](#run-statuses)
- [`run.json`](#runjson)
- [Conflict resolution records](#conflict-resolution-records)
- [Chat summary](#chat-summary)

## Run statuses

| Status        | Meaning                                                | Final for the run |
| ------------- | ------------------------------------------------------ | ----------------- |
| `skipped`     | The task had `state: done` before the run.             | yes               |
| `queued`      | The run selected the task and has not started it.      | no                |
| `running`     | Implementation, verification, resolution, or validation is in progress. | no |
| `waiting`     | The task awaits an answer to a stop, gaps, or landing validation. | no |
| `done`        | The task commit landed in this run.                    | yes               |
| `ended`       | The task ended without landing its commit.             | yes               |
| `not_started` | A predecessor did not reach `done`.                    | yes               |

| From | To | Condition |
| --- | --- | --- |
| `queued` | `running` | The task starts. |
| `running` | `waiting` | The task needs a user answer. |
| `waiting` | `running` | The user continues the task. |
| `waiting` | `ended` | The user ends the task. |
| `running` or `waiting` | `done` | The commit lands. |
| `running` | `ended` | An existing failure path ends the task. |

A waiting task frees its concurrency slot and leaves its dependents `queued`.

`state` in a task file is `pending` or `done`.
`done` means that a task commit landed on an integration branch or that `implement` finished the task.

## `run.json`

Write `<task directory>/runs/<run id>/run.json` during preparation.
Update it after each task status change.
Set `updated_at` on each write, in UTC ISO 8601 form.

```json
{
  "task_directory": "action-items/agent-tasks",
  "range": { "from": "01", "to": "03" },
  "start_branch": "main",
  "start_commit": "<hash>",
  "start_tree_changes": ["action-items/notes.md"],
  "integration_branch": "orchestrate/<run id>/integration",
  "integration_base": "<hash>",
  "continued": false,
  "concurrency_limit": 3,
  "pass_limit": 3,
  "platform_limits": [],
  "model_permissions": [],
  "started_at": "2026-09-29T10:15:00Z",
  "updated_at": "2026-09-29T10:31:12Z",
  "tasks": [
    {
      "file": "01-slugify.md",
      "status": "done",
      "commit": "<integration commit hash>",
      "agent_id": "<original task subagent identifier>",
      "verification_round": 1,
      "passes_used": 1,
      "waiting": null,
      "answers": [],
      "accepted_gaps": [],
      "model": { "selected": "sonnet", "used": "sonnet" },
      "effort": { "selected": "medium", "used": "medium" },
      "model_reason": "Two items in known files.",
      "coverage": [{ "item": "<Required behavior or Acceptance item>", "status": "covered", "evidence": "<test or command result>" }],
      "decision_ledger": ["<entry>"],
      "gaps": [{ "gap": "<gap>", "disposition": "<fixed, settled, or rejected with rationale>" }],
      "blocked_behavior": [],
      "extra_files": [],
      "left_out_files": [],
      "conflict_resolution": null,
      "ended": null,
      "worktree": null,
      "branch": null
    }
  ]
}
```

- `range` is `null` without a range.
- `start_branch` is `null` for a detached `HEAD`.
- Set `integration_branch` and `integration_base` to `null` when no integration branch remains for either reason:
  - The run started no task and no earlier branch qualifies for continuation.
  - The run created the branch and no task landed on it.
- If no task started, record any branch that qualifies for continuation and set `continued` to `true`.
- `continued` is `true` when the run continued the integration branch of an earlier run.
- Tasks with status `skipped`, `queued`, or `not_started` never started.
  - Set `commit`, `agent_id`, `model`, `effort`, `model_reason`, `waiting`, `conflict_resolution`, `ended`, `worktree`, and `branch` to `null`.
  - Set verification counters to 0 and list fields to empty lists.
- `commit` is the hash of the commit on the integration branch.
- Keep `agent_id`, the original task subagent's platform identifier, after waiting, continuation, or ending.
  - It is `null` for tasks that never started.
- `verification_round` and `passes_used` track verification within a continuation.
  - Initialize both to 0 before the task starts.
  - Start round 1 with 0 passes.
  - A continuation after final gaps starts a new round with 0 passes and the unchanged full `pass_limit`.
- `waiting` is `null` unless the task has status `waiting`.
  - A stop holds `{ "reason": "stop", "task_file": "<path>", "item": "<item>", "question": "<question>", "options": [{ "option": "<option>", "consequence": "<consequence>" }], "recommended": "<option or None>", "asked_at": "<UTC time>" }`.
  - Final gaps hold `{ "reason": "gaps", "task_file": "<path>", "gaps": [{ "item": "<item>", "location": "<location>", "gap": "<missing behavior or defect>", "evidence": "<verifier evidence>" }], "asked_at": "<UTC time>" }`.
  - For landing questions, use [landing question records](#landing-question-records).
  - Keep this payload when the session ends during a wait, leaving task `state` as `pending`.
- `answers` retains each question payload, the user's verbatim answer, its action, and UTC time.
  - Entries remain after `waiting` clears.
  - Actions are `continue`, `accept`, or `end`.
  - For landing answers, use [landing question records](#landing-question-records).
- `accepted_gaps` retains each accepted gap, its item, location, evidence, disposition `accepted`, and the user's answer.
  - Retain the accepted disposition in `gaps` and the acceptance in `decision_ledger`.
  - Never mark accepted gaps covered.
- `platform_limits` records observed failures to retain subagent context or to schedule during a question.
  - Each entry holds `platform`, `task_file`, `agent_id`, `limitation`, and the observed `evidence`.
  - Record only observed failures, never untested capabilities.
- `model_permissions` is an empty list unless the user explicitly permits a model outside the default policy for this run.
  - Each entry holds `model`, `user_answer`, and `authorized_at`.
  - Set `model` to the authorized exact provider ID or family.
  - Set `user_answer` to the user's verbatim permission.
  - Set `authorized_at` to the authorization time in UTC ISO 8601 form.
  - Record permission before dispatch and do not copy permissions from earlier runs.
  - Check selected and inherited models against the model permission policy, including when continuing an interrupted run.
- For `model` and `effort`, record selected and used values.
- `ended` for an ended task holds `reason` and one of `question`, `gaps`, `conflicting_files`, or `failure`.
  - For a stop, `question` holds `item` and `options`.
  - For landing validation, use [landing question records](#landing-question-records).
  - The reasons are `stop`, `gaps`, `blocked`, `conflict`, `landing_validation`, `commit_failed`, `no_changes`, and `invalid_reply`.
  - Keep `conflict` readable for earlier runs.
  - A `blocked` end lists the blocked behavior in `gaps`.
- `worktree` and `branch` hold the worktree path and the branch name while the task runs and after it ends.
  - They are `null` before the task starts and after the run removes them for a `done` task.
- `extra_files` lists committed files beyond `Changed files`.
- `left_out_files` lists changed files excluded from the commit, such as caches.

## Conflict resolution records

### Landing question records

Resolve and validate new landing conflicts before landing.
The user may end during an unresolved choice without completing resolution or validation.

A landing question holds `{ "reason": "landing_validation", "task_file": "<path>", "attempt": 1, "integration_tip": "<hash>", "candidate_tree": "<hash or null>", "conflicting_files": ["<path>"], "summary": "<resolution summary>", "affected_tasks": ["<task path>"], "failed_checks": ["<validation results>"], "issues": ["<missing evidence or unresolved choice>"], "options": ["accept", "instruct", "end"], "asked_at": "<UTC time>" }`.

- A landing instruction uses action `continue` in `answers`.
- A landing acceptance identifies its attempt, tip, tree, and every accepted failure or issue.
- For a `landing_validation` end, `ended.question` holds the saved landing `waiting` payload.
- Reference the preserved landing question and conflict resolution attempts when recording that end.

### Resolution attempts

`conflict_resolution` is `null` until a landing conflict occurs.
It then holds:

- `conflicting_files`, the union across attempts.
- `landed_attempt`, an attempt number or `null`.
- `attempts`, with these fields for each attempt:

| Field | Content |
| --- | --- |
| `number` | Attempt number. |
| `integration_tip`, `original_task_commit`, `candidate_tree`, `candidate_commit` | Hashes, or `null` before available. |
| `resolution_worktree` | Worktree path until removal, then `null`. |
| `conflicting_files`, `summary`, `affected_tasks` | Conflict paths, resolution summary, and each task's source path and earlier integration commit hashes when applicable. |
| `validation_sources` | Source task path and `Validation` section text from the start working tree. |
| `validation` | One entry per command or manual check, using the fields below. |
| `issues` | Missing provenance, unreadable or malformed sections, unresolved choices, or edits made by validation. |
| `accepted_items` | Every accepted failed or uncovered check or issue and the user's verbatim answer. |

Each `validation` entry holds:

| Field | Content |
| --- | --- |
| `task_file` | Source task file. |
| `command` | Command text, or `null` for manual checks. |
| `check` | Manual check text, otherwise `null`. |
| `result` | `passed`, `failed`, or `not_run`. |
| `exit_code` | Integer or `null`. |
| `reason` | Includes `manual` or the reason a command was not run. |

Never persist credentials or secret output.
Redact secrets from failure descriptions before storing them.
Retain every attempt, including failed checks, after instruction, acceptance, ending, or landing.

- Keep accepted failed checks `failed` and checks not run `not_run`.
- Set `landed_attempt` only to the attempt that actually landed.

## Chat summary

End the run with a summary containing:

- The status of each task, with its commit hash for `done` tasks.
- Each `ended` task's question, gaps, or conflicting files, its worktree, and its branch.
- Accepted gaps and accepted landing validation failures for committed tasks, and any recorded platform limits.
- Conflict files, resolution summary, validation failures, and retained resolution worktrees for tasks ended or still waiting after a landing question.
- If the session ends during a wait, each waiting task's question or gaps.
  - Include its retained worktree and branch, and `pending` task state.
- The integration branch, and whether the run continued it.
- The command to merge the integration branch, with instructions to run it from the start branch:

  ```sh
  git merge <integration branch>
  ```

  - Give no command when no integration branch remains.
- The path of `run.json`.
