---
name: implement
description: >-
  Implements one `to-agent-tasks` task through red-green TDD and independent requirement verification.
  Use when executing a named task file or a task delegated by an orchestrator.
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

Before implementing any unblocked requirement, load the installed `tdd` skill through the host's skill tool or catalog entrypoint.
Use `task-executor:tdd` for namespaced plugins; otherwise use its catalog name.
If it is missing or disabled, stop and report the required setup.
In delegated mode, follow its loop without starting subagents or asking the user.

## Canonical verifier prompt

For verifier preparation, read only this section.
In normal mode and orchestration, send each fresh verifier the block below unchanged except for filled placeholders.

```text
Verify <task file path> against changes in <changed files>.
Read the task, changed code, tests, and recorded decisions.
Decision ledger:
<ledger, or "None">
Blocked behavior:
<behavior and its blocker, or "None">
Prior rejected gaps:
<gap, boundary evidence, and rationale, or "None">
Treat ledger entries as binding when Executor choices delegates them or repository evidence supports them as routine and reversible.
Flag choices affecting required behavior, a public or persisted contract, security, external state, or scope unless the task or a binding ledger entry resolves them.
Reassess every rejected gap independently.
Classify every Required behavior and Acceptance item as covered, blocked, or a gap.
Covered requires implementation plus observed test or Validation evidence.
Run the task's safe Validation commands.
List states the change creates, such as new inputs, error paths, partial failures, and interactions with existing behavior.
Probe each state adversarially: assume it hides a security, data integrity, or Must preserve defect until evidence rules one out.
Exercise a state with safe commands where a harness exists; otherwise, inspect the code.
Preserve the working tree and make no edits.
Report each classification with evidence.
Report each probed state's method and result.
Report each gap with its location and the missing behavior or observed defect.
```
