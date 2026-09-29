# Run file and chat summary

## Run statuses

| Status        | Meaning                                                | Final for the run |
| ------------- | ------------------------------------------------------ | ----------------- |
| `skipped`     | The task had `state: done` before the run.             | yes               |
| `queued`      | The run selected the task and has not started it.      | no                |
| `running`     | A subagent or a verifier works on the task.            | no                |
| `done`        | The task commit landed in this run.                    | yes               |
| `ended`       | The task ended without a commit.                       | yes               |
| `not_started` | A predecessor did not reach `done`.                    | yes               |

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
  "started_at": "2026-09-29T10:15:00Z",
  "updated_at": "2026-09-29T10:31:12Z",
  "tasks": [
    {
      "file": "01-slugify.md",
      "status": "done",
      "commit": "<integration commit hash>",
      "model": { "selected": "sonnet", "used": "sonnet" },
      "effort": { "selected": "medium", "used": "medium" },
      "model_reason": "Two items in known files.",
      "coverage": [{ "item": "<Required behavior or Acceptance item>", "status": "covered", "evidence": "<test or command result>" }],
      "decision_ledger": ["<entry>"],
      "gaps": [{ "gap": "<gap>", "disposition": "<fixed, settled, or rejected with rationale>" }],
      "blocked_behavior": [],
      "extra_files": [],
      "left_out_files": [],
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
  - Set `commit`, `model`, `effort`, and `model_reason` to `null`, and the rest to empty lists.
- `commit` is the hash of the commit on the integration branch.
- For `model` and `effort`, record selected and used values following [Model and effort](prompts.md#model-and-effort).
- `ended` for an ended task holds `reason` and one of `question`, `gaps`, `conflicting_files`, or `failure`.
  - `question` holds `item` and `options`.
  - The reasons are `stop`, `gaps`, `blocked`, `conflict`, `commit_failed`, `no_changes`, and `invalid_reply`.
  - A `blocked` end lists the blocked behavior in `gaps`.
- `worktree` and `branch` hold the worktree path and the branch name while the task runs and after it ends.
  - They are `null` before the task starts and after the run removes them for a `done` task.
- `extra_files` lists committed files beyond `Changed files`.
- `left_out_files` lists changed files excluded from the commit, such as caches.

## Chat summary

End the run with a summary containing:

- The status of each task, with its commit hash for `done` tasks.
- Each `ended` task's question, gaps, or conflicting files, its worktree, and its branch.
- The integration branch, and whether the run continued it.
- The command to merge the integration branch, with instructions to run it from the start branch:

  ```sh
  git merge <integration branch>
  ```

  - Give no command when no integration branch remains.
- The path of `run.json`.
