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
4. Select the message through the entrypoint's Task commit messages procedure.
5. Commit on the task branch:

   ```sh
   git -C <worktree> commit -F -
   ```

   - End the task with the failure text when the commit fails, for example because of a hook.
6. Record the integration tip, then land the commit:

   ```sh
   git -C <integration worktree> cherry-pick <task commit>
   ```

   - The integration branch gains one commit, and its history stays linear.
7. On failure, list the unmerged files.
   - For conflicts, keep the task `running` and use the landing conflict procedure through state recording and cleanup.
   - After conflict resolution, return to scheduling.
   - Without conflicts, abort any active cherry-pick and confirm the integration tip is unchanged and its worktree is clean.
   - Without conflicts, [end the task](#end-a-task) with git output after those checks.
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
   - For landing validation questions, retain the resolution worktree and attempt history.
   - Name them in the summary.
