# Landing and ending a task

After landing or ending, return to scheduling.

## Commit and land

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

## End a task

1. Send the end instruction when the subagent has not ended, and wait for its `ended` message.
2. Keep the task `pending` and retain its worktree and branch for inspection.
3. Record run status `ended`, its reason, and the retained worktree and branch in `run.json`.
   - Include the question, gaps, conflicting files, or failure text.
