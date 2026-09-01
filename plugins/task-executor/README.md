# Task executor plugin

Implements coding-agent task files and verifies each result before reporting completion.

## What it does

The `implement-task` skill executes one task file from `project-advisor:to-agent-tasks`.

- Rejects tasks with missing required sections or listed blockers.
- Implements every required behavior through red-green TDD.
- Uses verifier subagents to map every requirement and acceptance item to evidence, then confirm each gap's disposition.
- Uses fresh review subagents to run `refactor-tools:review-changes` and fixes in-scope non-nit findings between passes.
- Reports coverage, review passes, deferred nits, and unresolved work.

Each verification loop runs up to three passes by default.
A requested verification limit applies separately to both loops.

## Requirements

- The `project-advisor` plugin produces the task files.
- The `refactor-tools` plugin provides the `review-changes` skill.

## Usage

```text
/task-executor:implement-task action-items/agent-tasks/01-short-task-title.md
"Implement the next agent task"
"Implement task 02 with up to 5 review passes"
```

## Learn more

The plugin bundles the [`implement-task`](./skills/implement-task/SKILL.md) skill.

## Authors

[dhohner](https://github.com/dhohner)
