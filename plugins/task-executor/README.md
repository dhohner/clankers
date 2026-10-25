# Task executor plugin

Task executor implements task files for coding agents and standalone changes using TDD, and verifies each task result before reporting completion.

## How it works

![Task Executor workflow. implement selects and checks one agent task file, then builds each required behavior through the tdd red-green-refactor loop. A fresh verifier subagent checks the changes and returns gaps to the tdd loop for up to three passes before the report. implement stops to ask you about an unclear task or a material decision. The tdd skill also runs on its own for any change.](./assets/workflow.svg)

### implement

The `implement` skill executes one task file from `project-advisor:to-agent-tasks`.

- Rejects tasks missing required sections and excludes only the behavior each listed blocker names.
- Settles routine, reversible choices from repository evidence and records material choices in a decision ledger.
- Stops only for decisions that would change required behavior, a public or persisted contract, security, external state, or scope.
- Implements every required behavior by first writing a failing test, then making it pass.
- Uses verifier subagents to map every requirement and acceptance item to evidence, then confirm how each gap was handled.
- Reports coverage, blocked behavior, the decision ledger, and unresolved gaps.
- Sets `state: done` in the task frontmatter after full coverage or your acceptance of uncovered items, such as remaining gaps or blocked behavior.
  - A refused task stays `pending` for a later bulk run.
  - A task file without frontmatter stays unchanged.

The verifier loop runs up to three passes by default.

Run `/refactor-tools:review-changes` on the result when the change warrants a review.
`implement` and `tdd` never commit.
Review and commit their results yourself.

### tdd

The `tdd` skill can run on its own for any feature, bug fix, or untested code, using the same loop of failing tests, passing changes, and refactoring.

- Splits the change into checks for individual behaviors, including boundary and failure cases.
- Counts a test as red only when its own assertion fails for the absent behavior.
- Writes the smallest passing change, reruns the affected suite, and refactors while green.
- Applies test quality rules for independently calculated expectations, real components, and mock boundaries.
- Finishes with a mutation check that names a failing test for each realistic break.

## Requirements

- The `project-advisor` plugin produces the task files.

## Usage

Use the current host's skill invocation syntax.
The selected model provider does not change that syntax or supply another host's tools.

### Claude Code

```text
/task-executor:implement action-items/agent-tasks/01-short-task-title.md
/task-executor:tdd add a retryOperation helper that retries three times
```

### Codex

Use an explicit `$` mention with the plugin installed:

```text
$task-executor:implement action-items/agent-tasks/01-short-task-title.md
```

### Pi coding agent

Install the repository's Pi bundle:

```sh
pi install git:github.com/dhohner/clankers
```

From a local checkout, install task executor:

```sh
pi install ./plugins/task-executor
```

The package exposes `implement` and `tdd` through Pi's installed skill catalog.

## Learn more

The plugin bundles the [`implement`](./skills/implement/SKILL.md) and [`tdd`](./skills/tdd/SKILL.md) skills.

## Authors

[dhohner](https://github.com/dhohner)
