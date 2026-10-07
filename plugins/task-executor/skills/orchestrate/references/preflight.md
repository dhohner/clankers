# Preflight

## Contents

- [Agent capabilities](#agent-capabilities)
- [Installed skills](#installed-skills)
- [Select the tasks](#select-the-tasks)
- [Task files](#task-files)
- [Start working tree](#start-working-tree)
- [Interrupted runs](#interrupted-runs)

Run every check below before creating any branch, worktree, or run folder.
Report all [task file problems](#task-files) in one message.
Stop the run before starting a task if any task file problem remains.

For a rerun, first follow [Interrupted runs](#interrupted-runs).

## Agent capabilities

Select the interface exposed by the current host.
Check dispatch, continuation with retained context, working directory selection, fresh verifiers, and scheduling during user questions.
Apply the model permission policy before any capability probe.
Confirm the configured or inherited model is allowed before creating run resources.

If the interface is absent or documents a missing capability, stop before creating the run folder, branches, or worktrees.
Report the required setup.
Loading the skill alone does not establish these capabilities.

## Installed skills

Confirm each dependency, `implement` and `tdd`:

- Appears in the host's installed skill catalog and is enabled for model invocation.
- Is available to task agents in their worktrees through a skill tool or catalog entrypoint.

Confirm the orchestrator can read the Canonical verifier prompt section of the installed `implement` entrypoint.
Use catalog entrypoints; never derive sibling paths.
If any check fails, stop before repository mutation and report the dependency, failed check, and required setup.

## Select the tasks

1. Take the `.md` files directly in the task directory whose names start with a numeric prefix.
2. Without a range, select every task file.
3. With two prefixes, select task files within that inclusive numeric range.
   - With one prefix or more than two, stop and ask the user for a range of two prefixes.
4. Stop with a message when the selection is empty.
5. Read the frontmatter of each selected file, and mark each selected task with `state: done` as skipped.
   - The run lists skipped tasks in its `run.json` and in the chat summary.

## Task files

Frontmatter starts with `---` on line 1, contains `depends_on` and `state`, and ends with another `---` line.
`state` is `pending` or `done`, and `depends_on` is a list of bare file names in the same directory.

- Name each selected file with characters outside letters, digits, `.`, `_`, and `-` in its name.
  - Also name each selected file whose stem fails this check:

    ```sh
    git check-ref-format --branch orchestrate/20260101T000000Z/<stem>
    ```

  - The check refuses stems such as `01-foo..bar`, `01-foo.`, and `01-foo.lock`.
- Name each selected file with absent or malformed frontmatter.
  - Tell the user to regenerate the tasks with `project-advisor:to-agent-tasks`.
- Check each selected task that is not skipped for missing predecessors.
  - A `depends_on` entry inside the selection needs no check here.
  - An entry outside the selection is missing unless that file exists in the task directory and has `state: done`.
  - An entry that names no file in the task directory, or holds a path separator, is missing.
  - A predecessor file without readable frontmatter is missing.
  - Name each task with each of its missing predecessors.
- Build the dependency graph from selected tasks and their `depends_on` entries within the selection.
  - A task that depends on itself is a cycle.
  - Name the tasks on a cycle and no task that only depends on one.

## Start working tree

Examine the uncommitted changes in the start working tree, including untracked files.

1. Ignore every change under `action-items/` and under the task directory.
2. Judge each other change.
   - A change is relevant when a selected task could read or change that path or its behavior.
   - Use the `Boundary`, `Required behavior`, and `Validation` sections of the selected tasks that are not skipped.
   - A generated artifact or an unrelated document is not relevant.
3. List relevant files and ask the user to commit or stash them.
   - After each reply, recheck and repeat until no relevant change remains.
4. Record every ignored change under `start_tree_changes` in `run.json`.

Task worktrees start from a commit and never hold the uncommitted changes of the start working tree.
A relevant change would give a task a different code base than the user sees.

Preflight is complete when the selection is nonempty, every selected task passes the file checks, and no relevant uncommitted change remains.
Resolve every pending preflight question before continuing.
When every selected task is skipped, prepare and record the run without branches or worktrees.

## Interrupted runs

If the session ends during a wait, its `run.json` retains `waiting` and the question or gaps.
Its task file stays `pending`.
Preserve its old worktree and branch for inspection.

On a rerun, select the pending task.
Start a fresh subagent in a new worktree from the integration branch tip.
Do not reuse the old waiting agent.

Skip `done` tasks and continue the earlier integration branch if preparation confirms it qualifies.

If the session ends after landing but before the `state` write, the task stays `pending` with its commit on the integration branch.
A rerun implements that task again on top of its earlier commit.

Before a rerun, check the integration branch's history:

```sh
git log
```

Manually set `state: done` for every task that already landed.
