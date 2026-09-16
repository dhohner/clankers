# Task executor plugin

Implements coding-agent task files and standalone changes through TDD, and verifies each task result before reporting completion.

## What it does

The `implement` skill executes one task file from `project-advisor:to-agent-tasks`.

- Rejects tasks missing required sections and excludes only the behavior each listed blocker names.
- Settles routine, reversible choices from repository evidence and records material choices in a decision ledger.
- Stops only for decisions that would change required behavior, a public or persisted contract, security, external state, or scope.
- Implements every required behavior through red-green TDD.
- Uses verifier subagents to map every requirement and acceptance item to evidence, then confirm each gap's disposition.
- Reports coverage, blocked behavior, the decision ledger, and unresolved gaps.

The verifier loop runs up to three passes by default.
Run `refactor-tools:review-changes` on the result when the change warrants a review.
Neither skill commits.
Review and commit the result yourself.

The `tdd` skill runs the same red-green-refactor loop on its own for any feature, bug fix, or untested code.

- Splits the change into single-behavior checks with their boundary and failure cases.
- Counts a test as red only when its own assertion fails for the absent behavior.
- Writes the smallest passing change, reruns the affected suite, and refactors while green.
- Applies test quality rules on hand-derived expectations, real components, and mock boundaries.
- Finishes with a mutation check that names a failing test for each realistic break.

## Requirements

- The `project-advisor` plugin produces the task files.

## Usage

```text
/task-executor:implement action-items/agent-tasks/01-short-task-title.md
/task-executor:tdd add a retryOperation helper that retries three times
```

## Learn more

The plugin bundles the [`implement`](./skills/implement/SKILL.md) and [`tdd`](./skills/tdd/SKILL.md) skills.

## Authors

[dhohner](https://github.com/dhohner)
