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

Read [Shared task rules](references/shared-rules.md) for task selection, implementation, and gap dispositions in either mode.
When the invoking prompt contains all three lines below, read and follow [Delegated mode](references/delegated-mode.md):

- `Mode: delegated`
- `Task file: <task file path>`
- `Working directory: <working directory path>`

Otherwise, read and follow [Normal mode](references/normal-mode.md).

Before implementing any unblocked requirement, invoke this plugin's `tdd` skill.
Use `task-executor:tdd` where plugin skills are namespaced.
Without a skill tool, read [the TDD skill](../tdd/SKILL.md) and load its references for the applicable conditions.
In delegated mode, apply its loop without starting subagents or asking the user.
