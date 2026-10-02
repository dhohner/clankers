# Run cleanup and locations

## Finish the run

1. Preserve directories containing an ended task's worktree, and remove the integration worktree if one was created:

   ```sh
   git worktree remove <path>
   ```

   - Remove the run directory and worktree root if empty.
   - Delete the integration branch if this run created it and no task landed on it.
   - For that deleted branch, record `null` for `integration_branch` and `integration_base`.
2. Check that the start branch still points at the start commit, and report any difference.
3. Write the chat summary with every selected task's final status and the integration branch, if one remains.

The run is complete when cleanup is finished and the chat summary accounts for every selected task.

## Names and locations

- Run id: the UTC start time, such as `20260929T101500Z`.
  - Run ids sort in start order.
- Create the run folder `<task directory>/runs/<run id>/` with `mkdir` so a duplicate id fails.
  - On failure, wait one second and take a new run id.
- Integration branch of a new run: `orchestrate/<run id>/integration`.
- Task branch: `orchestrate/<run id>/<task file stem>`, such as `orchestrate/20260929T101500Z/01-slugify`.
  - Preflight checks that stems are safe in branch names and shell commands.
  - Git refuses branch names that are directory prefixes of other branches, preventing collisions between these forms.
- Worktree root: `<parent of the start working tree>/<start working tree name>.worktrees/`.
  - This location keeps the start working tree's status free of worktree entries.
  - A sandbox can ask for approval to write there.
- Task worktree: `<worktree root>/<run id>/<task file stem>`.
- Integration worktree: `<worktree root>/<run id>/integration`.
