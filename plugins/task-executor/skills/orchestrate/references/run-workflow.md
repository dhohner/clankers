# Run workflow

## Prepare the run

Use [Names and locations](#names-and-locations) when creating run folders, branches, and worktrees.
When every selected task is skipped, follow these steps without creating branches or worktrees, then [finish the run](#finish-the-run).

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
6. For the first and subsequent `run.json` writes, follow [Run file](run-file.md#runjson).
   - Set skipped tasks to `skipped` and all others to `queued`.

Preparation is complete when the run folder and first `run.json` exist, with every selected task recorded.
If any selected task is pending, the integration worktree must also exist.

## Schedule the tasks

A task is ready when each task in its `depends_on` list has `state: done` in its task file.
Use [Run statuses](run-file.md#run-statuses) to distinguish final statuses from tasks still in progress.

Repeat until each selected task has a final run status:

1. Set each `queued` task to `not_started` when a predecessor has the run status `ended` or `not_started`.
   - Apply the rule again to tasks that depend on the changed tasks.
2. Start each `queued` ready task in prefix order while fewer tasks than the concurrency limit are in progress.
   - Run started tasks at the same time.
3. Handle subagent results with [Run one task](#run-one-task) and user answers with [Handle an answer](#handle-an-answer).
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

## Run one task

### Start

1. Create the task worktree and a new task branch from the integration branch's current tip:

   ```sh
   git worktree add -b <task branch> <task worktree> <integration branch>
   ```

2. Follow [Model and effort](prompts.md#model-and-effort) to choose the model and effort, then record the choice and reason.
3. Set the run status to `running`, record the worktree and the branch, and update `run.json`.
4. Start a fresh subagent with the [task subagent prompt](prompts.md#task-subagent-prompt).
   - Record its platform identifier in `agent_id` and retain it for every later instruction.
   - Initialize `verification_round` to 1 and `passes_used` to 0.
   - Use the host interface selected during [Agent capabilities](preflight.md#agent-capabilities).
   - Follow [Platform mechanisms](prompts.md#platform-mechanisms) for dispatch and later instructions.

### Handle the reply of the task subagent

Read the `Message:` line of the reply.

- For `stop`, record the task file, `Question`, `Item`, `Options`, and `Recommended`, then [wait for an answer](#wait-for-an-answer).
- For `implemented`, start [verification](#verify).
- For any other reply, record it and [end the task](#end-a-task).

### Verify

For each `implemented` reply, start a fresh verifier in the task worktree using the [verifier prompt](prompts.md#verifier-prompt).
Fill it from that reply and count one pass.
For the scope of verification, see [Verification limits](#verification-limits).

Full coverage requires no gaps and `covered` for every `Required behavior` and `Acceptance` item.
A `blocked` item is uncovered and names a blocker that further passes cannot remove.

| Report | Action |
| --- | --- |
| Full coverage | Record the coverage map, decision ledger, gap dispositions, and blocked behavior, then [commit and land](#commit-and-land). |
| Any blocked item | Record the blocked behavior and gaps, then [end the task](#end-a-task) with reason `blocked`. |
| Gaps, no blocked item, passes remain | Send the [gaps instruction](prompts.md#instructions) to the same task subagent and handle its reply above. |
| Gaps, no blocked item, last pass | Record the coverage, ledger, gap dispositions, and gaps, then [wait for an answer](#wait-for-an-answer). |

Increment `passes_used` for every verifier pass and persist it in `run.json`.
A continuation after final gaps resets `passes_used` to 0 and increments `verification_round`.
The configured pass limit applies in full again.

### Wait for an answer

1. Preserve the latest `implemented` reply and verifier report, when present.
2. Set status to `waiting` and persist `waiting` in `run.json` before asking.
   - For a stop, it holds the task file, affected item, question, options with consequences, and recommendation.
   - For final gaps, it holds the task file and every gap.
   - Each gap includes its affected item, location, missing behavior or defect, and evidence.
3. Ask using [User questions](prompts.md#user-questions).
   - Name the task file and affected items.
   - For a stop, repeat the question, options, consequences, and recommendation, and offer ending without a commit.
   - For final gaps, display every gap.
   - For final gaps, offer accepting and committing, continuing with instructions, or ending without a commit.
   - Explain that continuing final gaps starts a new round with the full verification limit.
4. Return to scheduling without waiting synchronously for the answer.

### Handle an answer

Identify the task from its question before acting.
Clarify answers that are ambiguous, lack a required decision or continuation instruction, or identify no single waiting task.
Keep the task `waiting` during clarification.

Never infer acceptance of gaps from silence or a generic request to continue.

Record the user's answer and question in `answers` before dispatch.
Always persist a new stop or final gap before asking again.
An accepted gap does not authorize a later gap that differs from it.

#### Continue a stop

- Clear `waiting`, set `running`, and persist.
- Send [answer](prompts.md#instructions) to the recorded `agent_id` with the decision and affected item.
- Handle the next reply through [Handle the reply](#handle-the-reply-of-the-task-subagent), verifying an `implemented` result as before.

#### Continue final gaps

- Clear `waiting`, set `running`, reset `passes_used` to 0, increment `verification_round`, and persist.
- Send `answer` to the same agent with the user's instruction and full gap report.
- Handle its reply and verify with the full pass limit.

#### Accept final gaps

- Record every explicitly accepted gap with disposition `accepted` in the ledger and `accepted_gaps`.
  - Include its evidence and the user's decision.
- Send `answer` to the same agent with the acceptance.
  - Ask it to record the decision and return `implemented` without further changes.
- Keep the task `waiting` until that reply arrives.
  - This acknowledgment creates no new implementation work.
- For `implemented` with unchanged implementation and uncovered items, [commit and land](#commit-and-land).
  - Use that reply and the accepted coverage map.
- For a new `stop`, ask about that stop.
- If implementation or uncovered items change, clear the pending acceptance and set `running`.
  - Verify in a new full round before committing.
- Preserve accepted gaps in `run.json`, never relabeling them as covered.

#### End either wait

- Send `end` to the same agent through [End a task](#end-a-task).
- Clear `waiting` only after its `ended` reply and persist `ended`.
- Propagate `not_started` to queued dependents through the scheduler.

### Commit and land

1. Stage the changes in the task worktree.
   - Stage `Changed files` from the latest `implemented` message:

     ```sh
     git -C <worktree> add -A -- <changed files>
     ```

   - Then list the remaining changes in the worktree.
   - Exclude generated artifacts, such as caches, bytecode, and build output.
   - Stage every other source, test, or documentation change belonging to the task.
   - Record the files staged beyond the list and the files left out.
2. Unstage every path under the task directory.
3. End the task with the reason `no_changes` when nothing is staged.
4. Write the commit message.
   - The subject is a Conventional Commit `type(scope): summary` of at most 72 characters.
   - The body explains what changed and why, wrapped at 72 columns.
   - Take the content from the task outcome and the staged diff.
   - Write the subject and body as the user's own, with no trailer, agent name, or AI attribution.
5. Commit on the task branch:

   ```sh
   git -C <worktree> commit -F -
   ```

   - Keep the subject and body within the limits, amending the commit when needed.
   - End the task with the failure text when the commit fails, for example because of a hook.
6. Land the commit:

   ```sh
   git -C <integration worktree> cherry-pick <task commit>
   ```

   - The integration branch gains one commit, and its history stays linear.
7. On failure, list the conflicting files and abort:

   ```sh
   git -C <integration worktree> cherry-pick --abort
   ```

   - Confirm that the integration branch tip is unchanged and that its worktree is clean.
   - [End the task](#end-a-task) with the conflicting files, or with the git output when no file conflicts.
8. After the commit lands, immediately do both writes.
   - Preserve every other byte when replacing the task's state.
   - In the start working tree's task file, replace the frontmatter line `state: pending` with `state: done`.
   - Set the run status to `done`, record the integration commit hash, and update `run.json`.
9. Remove only the task worktree and branch created by this run:

   ```sh
   git worktree remove --force <worktree>
   git branch -D <task branch>
   ```

Landing is complete when the integration commit is recorded, task `state` is `done`, and its worktree and branch are removed.

### End a task

1. Send the [end instruction](prompts.md#instructions) when the subagent has not ended, and wait for its `ended` message.
2. Keep the task `pending` and retain its worktree and branch for inspection.
3. Record run status `ended`, its reason, and the retained worktree and branch in `run.json`.
   - Include the question, gaps, conflicting files, or failure text.

## Finish the run

1. Preserve directories containing an ended task's worktree, and remove the integration worktree if one was created:

   ```sh
   git worktree remove <path>
   ```

   - Remove the run directory and worktree root if empty.
   - Delete the integration branch if this run created it and no task landed on it.
   - For that deleted branch, record `null` for `integration_branch` and `integration_base`.
2. Check that the start branch still points at the start commit, and report any difference.
3. Write the [chat summary](run-file.md#chat-summary) with every selected task's final status and the integration branch, if one remains.

The run is complete when cleanup is finished and the chat summary accounts for every selected task.

## Names and locations

- Run id: the UTC start time, such as `20260929T101500Z`.
  - Run ids sort in start order.
- Run folder: `<task directory>/runs/<run id>/`, created with `mkdir` so that a duplicate id fails.
  - On failure, wait one second and take a new run id.
- Integration branch of a new run: `orchestrate/<run id>/integration`.
- Task branch: `orchestrate/<run id>/<task file stem>`, such as `orchestrate/20260929T101500Z/01-slugify`.
  - [Preflight](preflight.md#task-files) checks that stems are safe in branch names and shell commands.
  - Git refuses branch names that are directory prefixes of other branches, preventing collisions between these forms.
- Worktree root: `<parent of the start working tree>/<start working tree name>.worktrees/`.
  - This location keeps the start working tree's status free of worktree entries.
  - A sandbox can ask for approval to write there.
- Task worktree: `<worktree root>/<run id>/<task file stem>`.
- Integration worktree: `<worktree root>/<run id>/integration`.

## Verification limits

Each verifier checks one task in its own worktree.
The skill does not run the `Validation` commands on the integration branch after a landing.
Two parallel tasks that apply cleanly and break each other both reach `done`.

When reviewing the integration branch, run the task validation there.
