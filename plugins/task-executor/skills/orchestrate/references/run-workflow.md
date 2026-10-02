# Prepare and schedule the run

## Prepare the run

Use the run's assigned names and locations for folders, branches, and worktrees.
If every selected task is skipped, follow these steps without creating branches or worktrees, then finish the run.

1. Record the start branch and the start commit.
   - A detached `HEAD` records `null` for the branch.
2. Choose the integration branch, also when every selected task is skipped.
   - Before creating the run folder, read the latest earlier run's `run.json`.
   - Find it in the last folder by name under `<task directory>/runs/`.
   - Continue that run's `integration_branch` if it exists and this command lists at least one commit:

     ```sh
     git rev-list HEAD..<branch>
     ```

   - Otherwise, if tasks are pending, choose a new integration branch from `HEAD` and record `HEAD` as the base.
   - If every task is skipped, record the branch that qualifies for continuation, or `null` when none qualifies.
   - Merges that rewrite commits, such as squash or rebase merges, leave them listed, so the run continues the branch.
   - After such a merge, the user deletes the integration branch to end the continuation.
   - On a continuation, append commits to the branch as it stands, and keep its recorded `integration_base`.
   - On a continuation, tell the user the branch name and list its commits since the base.
3. Stop when a continued branch is checked out in a worktree, because git allows one worktree per branch.
   - Name that worktree in the message.
4. Create the run folder.
5. When at least one selected task is pending, create the integration worktree.
   - For a new branch, run:

     ```sh
     git worktree add -b <branch> <path> HEAD
     ```

   - For a continued branch, run:

     ```sh
     git worktree add <path> <branch>
     ```
6. Write the initial `run.json` and update it after each status change.
   - Set skipped tasks to `skipped` and all others to `queued`.

Preparation is complete when the run folder and first `run.json` exist, with every selected task recorded.
If any selected task is pending, the integration worktree must also exist.

## Schedule the tasks

A task is ready when each task in its `depends_on` list has `state: done` in its task file.
Distinguish final run statuses from tasks still in progress.

Repeat until each selected task has a final run status:

1. Set each `queued` task to `not_started` when a predecessor has the run status `ended` or `not_started`.
   - Apply the rule again to tasks that depend on the changed tasks.
2. Start each `queued` ready task in prefix order while fewer tasks than the concurrency limit are in progress.
   - Run started tasks at the same time.
3. Handle subagent results and user answers.
   - Return to step 1 after each result or answer.
   - A `waiting` task consumes no concurrency slot.
   - Start and land every independent ready task while a task waits.
   - Direct and transitive dependents of a waiting task remain `queued` until their predecessors reach `done` or end.
   - Keep this loop running during user questions.
   - Do not wait for an answer to land independent results.
   - If only waiting tasks and their dependents remain, keep the run open for answers.
   - If the session ends during a wait, retain the question or gaps and `waiting` status.
   - In that case, keep its task file `pending`, send no `end`, and skip normal finish cleanup for that task.

Land one task at a time on the integration branch.
