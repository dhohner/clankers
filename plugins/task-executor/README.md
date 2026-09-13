# Task executor plugin

Implements coding-agent task files and verifies each result before reporting completion.

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

## Requirements

- The `project-advisor` plugin produces the task files.

## Usage

```text
/task-executor:implement action-items/agent-tasks/01-short-task-title.md
```

## Learn more

The plugin bundles the [`implement`](./skills/implement/SKILL.md) skill.

## Authors

[dhohner](https://github.com/dhohner)
