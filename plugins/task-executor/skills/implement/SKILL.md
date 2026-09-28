---
name: implement
description: >-
  Implement one `to-agent-tasks` task through red-green TDD and independent requirement verification.
disable-model-invocation: true
---

# Implement an agent task

Treat the task file as the contract for its outcome, boundary, and validation.

A material decision is an unresolved choice affecting required behavior, a public or persisted contract, security, external state, or scope.
Implement agreed requirements without further approval, and settle routine choices from repository evidence.
Escalate only ambiguous task selection, missing required sections, unresolved material decisions, or acceptance of uncovered items after reporting.

## Choose the mode

When the invoking prompt contains all three lines below, read and follow [Delegated mode](references/delegated-mode.md):

- `Mode: delegated`
- `Task file: <task file path>`
- `Working directory: <working directory path>`

Otherwise, read and follow [Normal mode](references/normal-mode.md).
