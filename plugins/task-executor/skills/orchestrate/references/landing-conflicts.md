# Resolve a landing conflict

Use this procedure when the landing task's commit conflicts with the integration tip.
Keep the task `running` during resolution and validation.
Land tasks serially, including the final tip check and commit transfer.

## Contents

- [Prepare a candidate](#prepare-a-candidate)
- [Identify affected tasks](#identify-affected-tasks)
- [Validate the candidate](#validate-the-candidate)
- [Wait and handle an answer](#wait-and-handle-an-answer)
- [Retry a candidate](#retry-a-candidate)
- [Land the candidate](#land-the-candidate)

## Prepare a candidate

1. Record the integration tip, list every unmerged path, then abort the integration cherry-pick:

   ```sh
   git -C <integration worktree> diff --name-only --diff-filter=U
   git -C <integration worktree> cherry-pick --abort
   ```

   Save the paths in the landing task's `conflict_resolution` record.
   Confirm the tip is unchanged and the integration worktree is clean.
2. Create a detached resolution worktree at that tip and replay the original task commit:

   ```sh
   git worktree add --detach <resolution worktree> <integration tip>
   git -C <resolution worktree> cherry-pick --no-commit <original task commit>
   ```

   - Use `<worktree root>/<run id>/<task stem>-resolution-<attempt number>`.
   - Use a fresh worktree for every validation attempt, including retries after instructions or edits made by validation.
   - Carry intended source changes forward without generated caches or build outputs that could hide the new resolution.
   - Keep the original task worktree, branch, commit, and agent context.
   - Keep the integration branch available for independent tasks to land during a wait.
   - Add this replay's unmerged paths to the retained conflict path union.
   - [Identify affected tasks](#identify-affected-tasks) before resolving.
3. Check for a material choice without a proposed outcome in the task contracts.
   - If one exists, use the landing waiting procedure below to ask and record the choice before resolving.
   - For that choice, resume only after recording the answer, or end through the user's end action.
4. Resolve every unmerged path using the tasks' outcomes, required behavior, acceptance, and boundaries.
   - Preserve earlier requirements where they can coexist.
   - For contradictory explicit requirements, propose the landing task's requested value.
   - Validate every affected task before asking about requirements that cannot coexist.
   - Never treat the proposal as authorization to land.
   - Never choose an entire side merely because it is the landing task's version.
   - Restrict edits to the task result and changes needed to resolve its conflicts.
   - Exclude every path under the task directory and generated artifacts before staging resolved paths.
   - Apply the staging rules from Commit and land.
   - If the resolution removes the landing task's entire diff, still validate the candidate and ask about failures.
   - Confirm no unmerged entries or conflict markers remain from the resolution.
5. Record a short resolution summary and the candidate tree from `git write-tree`.
   - Persist the attempt before validation.

## Identify affected tasks

Include the landing task once and every earlier task whose integration commit changed a conflict path.

- Walk task commits on the integration branch between `integration_base` and the attempt's tip.
  - Match integration hashes to task records in this run and earlier runs using this integration branch.
  - Include every matching task, including `done` tasks and tasks outside this run's selected range.
- Compare each commit to its parent with `git diff-tree --no-commit-id --name-status -r -M <commit>`.
  - Match only equal, complete repository paths, including both names for renames.
  - Include old and new names of conflicted paths in the original task commit and candidate diff.
- Retain the union of earlier and new conflict paths across retries.
  - Recompute affected tasks against the current tip, including commits landed during a wait.
- For a relevant commit without a task mapping or readable task file, record the missing evidence.
  - Ask before landing.
  - Never treat missing provenance as successful validation.

## Validate the candidate

For each attempt, read every affected task's `Validation` section only from its task file in the start working tree.
Record the source task path and section text with the attempt.

1. Extract executable commands and manual checks.
   - Inspect complete commands, including pipelines, shell substitutions, and invoked scripts, for effects and target environments.
   - Never run deployments, uploads, pushes, shared data migrations, or indirect equivalents.
   - Run only proven local commands that neither change remote or shared state nor use credentials for such changes.
   - Record unsafe or unclassified commands as `not_run` with a reason.
   - Treat them as uncovered commands that block automatic landing.
   - Record missing, malformed, or unreadable `Validation` sections as validation issues that block automatic landing.
   - Before execution, confirm every extracted command is classified as safe or recorded `not_run` with a reason.
2. Run every safe command against the candidate tree from the resolution worktree, in each task's section order.
   - Check every affected task even after a failure.
   - Record separate task results for identical commands in different sections.
   - Record command text, source task file, `passed` or `failed`, and exit code.
   - Include a short failure description with secrets redacted.
3. Record every manual check as `not_run` with reason `manual`.
   - Manual checks alone do not block the command validation gate or count as passed.
4. Check that validation left the tracked candidate tree unchanged.
   - For tracked edits made by validation, follow [retry a candidate](#retry-a-candidate).
   - Exclude generated untracked artifacts from the commit.
5. Persist all results in `run.json`.
   - [Land the candidate](#land-the-candidate) if it is eligible under the gates below.
   - Otherwise, wait for the user's answer.

### Eligibility

An eligible candidate is resolved and has completed results for every available safe command.
It meets one of these gates:

- Every executable command passes and no unresolved validation issue remains.
- The user explicitly accepts the candidate resolution and every failed or uncovered check or issue.

Eligibility applies only to the recorded integration tip, candidate tree, and validation results.
Require new explicit acceptance for a changed candidate or different failure when relying on the acceptance gate.

## Wait and handle an answer

Apply the waiting and user question rules for question identity, persistence before asking, clarification, independent scheduling, and dependent tasks.
Use `waiting.reason: landing_validation` for this question.
Keep the task file `pending` and leave this task's integration result unchanged during the question.

Name the landing task, affected tasks, conflict files, and resolution summary.
List every failed or uncovered command and unresolved validation issue.
Record each answer with its question in `answers` before acting.
Offer these actions with consequences:

- Accept each displayed failed or uncovered item and the candidate resolution, then land it as the task's one commit.
  - Resolve and validate an answered choice before accepting its candidate for landing.
  - Confirm the candidate meets the acceptance gate for eligibility.
  - Record the verbatim answer, failed commands, and accepted items in the attempt and decision ledger.
  - Clear `waiting`, set `running`, and persist before checking the tip and landing.
  - Never execute unsafe commands based on acceptance.
- Instruct another resolution.
  - Clear `waiting`, set `running`, and persist.
  - Follow [retry a candidate](#retry-a-candidate) with the instruction.
  - If validation fails, ask again with the new results.
- End the task without changing its integration result.
  - Keep the task `pending` and record `ended` with reason `landing_validation`.
  - Retain the original task worktree, branch, and resolution worktree for inspection.
  - Send `end` to the original task agent through the existing ending procedure.
  - Name the retained paths and branch in the summary.

A waiting resolution frees its concurrency slot.
Continue starting, validating, and landing independent tasks while dependents wait.
If the session ends during the question, preserve the question, task and resolution worktrees, and `waiting` status.

## Retry a candidate

Use a fresh resolution worktree at the current integration tip for every retry.
Keep previous attempts and the conflict path union in `run.json`.
Keep the original task worktree, branch, commit, and agent context.

| Trigger | Required action |
| --- | --- |
| User instruction | Apply the instruction to the new candidate. |
| Validation edits tracked files | Inspect and resolve the edits, then stage the intended result before carrying it forward. |
| Integration tip advances | Replay the original task commit on the new tip. |
| Commit hook changes the tree | Resolve the hook's edits and carry the intended changes forward before transfer. |
| Transfer conflicts or its tip changes | Abort any active cherry-pick before restarting. |

Build the new candidate from the original task commit, carrying intended source changes without generated caches or build outputs.
Resolve again, recompute affected tasks, and rerun every affected validation, even if the replay applies cleanly.
Persist the new attempt and results before returning to the landing gate or asking about failures.

## Land the candidate

1. Check the integration tip against the attempt's tip immediately before landing.
   - If it advanced, follow [retry a candidate](#retry-a-candidate).
2. With the tip stable, commit the eligible candidate's staged tree in the detached resolution worktree.
   - Use the original task commit's subject and body.
   - Allow an empty commit when the eligible candidate removes the task's entire diff.
   - Confirm the candidate has exactly one parent, equal to the validated integration tip.
   - Confirm its tree equals the validated candidate tree.
   - End a failed commit or hook through the existing `commit_failed` rule.
   - If a hook changes the tree, follow [retry a candidate](#retry-a-candidate) before transfer.
3. Transfer the candidate without another commit:

   ```sh
   git -C <integration worktree> cherry-pick --ff <resolved candidate commit>
   ```

   - Serialize the transfer with the tip check.
   - If the tip changed or transfer conflicts, follow [retry a candidate](#retry-a-candidate).
   - Never land an unvalidated combination.
   - Confirm the integration tip is the candidate commit and its tree is the validated tree.
4. After successful transfer, perform the task state and `run.json` writes and task cleanup from Commit and land.
   - Record the landed attempt and any explicit acceptance of its failures.
   - Remove this task's resolution worktrees and set their recorded paths to `null`.
   - Preserve attempt history, conflict paths, summaries, and every validation result.

The resolved task contributes exactly one commit above the integration tip.
Preserve the start branch, its index, and its source files.
