# Task executor plugin

Implements coding-agent task files and standalone changes through TDD, and verifies each task result before reporting completion.
The `orchestrate` skill runs a task set in parallel worktrees and commits each verified result to an integration branch.

## How it works

![Task Executor workflow. implement selects and checks one agent task file, then builds each required behavior through the tdd red-green-refactor loop. A fresh verifier subagent checks the changes and returns gaps to the tdd loop for up to three passes before the report. implement stops to ask you about an unclear task or a material decision. The tdd skill also runs on its own for any change.](./assets/workflow.svg)

### implement

The `implement` skill executes one task file from `project-advisor:to-agent-tasks`.

- Rejects tasks missing required sections and excludes only the behavior each listed blocker names.
- Settles routine, reversible choices from repository evidence and records material choices in a decision ledger.
- Stops only for decisions that would change required behavior, a public or persisted contract, security, external state, or scope.
- Implements every required behavior through red-green TDD.
- Uses verifier subagents to map every requirement and acceptance item to evidence, then confirm each gap's disposition.
- Reports coverage, blocked behavior, the decision ledger, and unresolved gaps.
- Sets `state: done` in the task frontmatter after full coverage or your acceptance of uncovered items, such as remaining gaps or blocked behavior.
  - A refused task stays `pending` for a later bulk run.
  - A task file without frontmatter stays unchanged.

The verifier loop runs up to three passes by default.

An orchestrator can run `implement` in delegated mode through a subagent that reads the skill file.
The subagent prompt contains the lines `Mode: delegated`, `Task file: <path>`, and `Working directory: <path>`.
In delegated mode, `implement` never asks you, starts no verifier, and leaves the task file unchanged.

It returns a `stop`, `implemented`, or `ended` message and follows the orchestrator's `gaps`, `answer`, and `end` instructions.

Run `/refactor-tools:review-changes` on the result when the change warrants a review.
`implement` and `tdd` never commit.
Review and commit their results yourself.

### orchestrate

The `orchestrate` skill implements a task set or prefix range with one command.
It checks the current host's agent interface before creating branches or worktrees.
Pi requires a configured integration that supports persistent task agents, fresh verifiers, and concurrent scheduling.
Its built-in tools and bundled subagent example alone lack required capabilities.
For host setup, see [Host mechanisms](./skills/orchestrate/references/host-mechanisms.md).

- Runs each ready task in its own git worktree, with a fresh subagent that follows `implement` in delegated mode.
  - A task is ready when each task in its `depends_on` list has `state: done`.
- Starts independent tasks together, up to a concurrency limit of 3 by default.
- Chooses each task's model and effort from its content, and records the choice and reason.
- Verifies each result with fresh verifier subagents, up to three passes by default, and sends the gaps back to the task subagent.
- Creates one integration branch commit per fully covered task or result whose remaining gaps you explicitly accept.
  - Sets `state: done` in the task file after landing.
  - The run never pushes.
  - The start branch stays unchanged, so you review the integration branch and merge it yourself.
- Asks you when a subagent stops for a decision or gaps remain after the last pass.
  - A stop question names the task, affected item, options, consequences, and recommendation.
  - For final gaps, choose acceptance, continuation with an instruction, or ending the task.
  - Sends continuations to the same subagent with its context.
  - Continuing final gaps restarts verification with the full pass limit.
  - A waiting task frees its concurrency slot while independent tasks keep starting and committing.
  - Direct and transitive dependents wait.
  - Ending the task leaves them `not_started`.
  - Accepted gaps stay recorded in `run.json` with your decision.
- Ends a task without a commit when you choose end, a listed blocker prevents coverage, or landing conflicts.
  - The task stays `pending` and retains its worktree and branch.
  - The summary names both.
- Skips done tasks on reruns and continues the latest earlier run's integration branch while it contains commits absent from `HEAD`.
  - After you merge the integration branch, a rerun starts a new one from `HEAD`.
  - A squash or rebase merge leaves the branch commits absent from `HEAD`.
  - Delete the integration branch after such a merge.
- Writes `run.json` in `<task directory>/runs/<timestamp>/` after each status change.
  - During a wait, it records `waiting` and the question or gaps.
  - If the session ends during the wait, the task stays `pending`.
  - A rerun starts it in a new worktree.

The preflight starts no branch or worktree in these cases:

- A selected task's file name contains characters outside letters, digits, `.`, `_`, and `-`, or its stem is invalid in a branch name.
- A selected task file has no frontmatter.
  - Regenerate the tasks with `project-advisor:to-agent-tasks`.
- A selected task depends on a missing file or a task outside the range without `state: done`.
- The selected tasks depend on each other in a cycle.
- The start working tree holds uncommitted changes that a selected task could read or change.
  - Commit or stash them.
  - Changes under `action-items/` never block the run.

Known limits:

- Continuation requires the platform to deliver later instructions to the original subagent with its context.
  - Scheduling must continue before the user answers.
  - If either capability fails, the run records and reports the observed limit in `run.json` under `platform_limits`.
  - A task whose context cannot be resumed stays `waiting` and `pending` for a rerun.
  - Check these capabilities on the current host with the [waiting fixture](./skills/orchestrate/references/waiting-fixture.md).
- The run does not validate the landed combination of parallel tasks.
  - Run the task validation on the integration branch during your review.
- If the session ends after landing but before the `state` write, the task stays `pending` with its commit on the integration branch.
  - Before rerunning, check the integration branch's history:

    ```sh
    git log
    ```

### tdd

The `tdd` skill runs the same red-green-refactor loop on its own for any feature, bug fix, or untested code.

- Splits the change into single-behavior checks with their boundary and failure cases.
- Counts a test as red only when its own assertion fails for the absent behavior.
- Writes the smallest passing change, reruns the affected suite, and refactors while green.
- Applies test quality rules on hand-derived expectations, real components, and mock boundaries.
- Finishes with a mutation check that names a failing test for each realistic break.

## Requirements

- The `project-advisor` plugin produces the task files.

## Usage

Use the current host's skill invocation syntax.
The selected model provider does not change that syntax or supply another host's tools.

### Claude Code

```text
/task-executor:implement action-items/agent-tasks/01-short-task-title.md
/task-executor:orchestrate
/task-executor:orchestrate tasks 03 to 06 with a concurrency limit of 2 and 5 verifier passes
/task-executor:tdd add a retryOperation helper that retries three times
```

### Codex

Use an explicit `$` mention with the plugin installed:

```text
$task-executor:orchestrate tasks 03 to 06
```

### Pi coding agent

Load the skill directories for this session:

```sh
pi --skill <repository>/plugins/task-executor/skills
```

Configure the persistent agent integration through its documented setup, then invoke:

```text
/skill:orchestrate tasks 03 to 06
```

Pi also uses `/skill:implement` and `/skill:tdd` for the other skills.

## Learn more

The plugin bundles the [`implement`](./skills/implement/SKILL.md), [`orchestrate`](./skills/orchestrate/SKILL.md), and [`tdd`](./skills/tdd/SKILL.md) skills.

## Authors

[dhohner](https://github.com/dhohner)
