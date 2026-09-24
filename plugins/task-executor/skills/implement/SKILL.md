---
name: implement
description: >-
  Implement one `to-agent-tasks` task through red-green TDD and independent requirement verification.
disable-model-invocation: true
---

# Implement an agent task

Treat the task file as the contract for its outcome, boundary, and validation.

A material decision changes required behavior, a public or persisted contract, security, external state, or scope.
Settle every other choice from repository evidence.

Complete all four steps in one pass.
Stop only for an ambiguous selection, missing section, or unresolved material decision.

## Select and gate the task

Select the named task, or the sole task in `action-items/agent-tasks/`.
If neither identifies one task, list the candidates and ask the user.
Set the verifier limit to the user's verification limit, or three passes by default.

Require `Outcome`, `Required behavior`, `Acceptance`, and `Validation` sections.
Record the `HEAD` commit and every existing change in the working tree.
Track files changed for the task and limit verifier verdicts to them.

Modify only `May change` content and preserve every `Must preserve` property.
Exclude only the behavior each `Blockers` item names, and record it as blocked behavior.
Create a decision ledger with one entry per `Executor choices` item.

Selection is complete when one task passes the structure gate, with its baseline, limits, blocked behavior, and ledger recorded.

## Implement with TDD

Invoke the `tdd` skill from this plugin (`task-executor:tdd` where plugin skills are namespaced) and follow its loop for every unblocked `Required behavior` and `Acceptance` item.
Take each check's seam from its `Acceptance` item and the task `Boundary`.
Split each item into single-behavior checks for its stated success, boundary, and failure cases.
Map every check back to its item.
When a check has no runnable harness, record the reason and rely on the item's `Validation` manual check.

Record each material choice and its rationale in the ledger.
Run every task `Validation` command.

Implementation is complete when every check has red-green evidence or a recorded manual result, the ledger holds every material choice, and every validation command passes.

## Verify requirement coverage

Run a fresh verifier subagent with this prompt:

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
Flag other choices that change required behavior, a public or persisted contract, security, external state, or scope as gaps.
Reassess every rejected gap independently.
Classify every Required behavior and Acceptance item as covered, blocked, or a gap.
Covered requires implementation plus observed test or Validation evidence.
Run the task's safe Validation commands.
Preserve the working tree and make no edits.
Report each classification with evidence.
For each gap, name the missing behavior and location.
Report any observed security, data integrity, or Must preserve defect as a gap with its location.
```

Give every gap one disposition before the next pass:

- Fix valid gaps within scope through the TDD loop.
- Settle gaps in the ledger when `Executor choices` delegates them or repository evidence supports a routine, reversible choice.
- Reject a gap only with boundary evidence and rationale.
- Stop at a gap that exposes an unresolved material decision.

Send the fixes, ledger, blocked behavior, and rejected gaps to a fresh verifier.
Repeat until a verifier reports full coverage or reaches the pass limit.
Record every gap remaining after the final pass.

Verification is complete when a verifier reports full coverage or every final gap has a recorded disposition.

## Report

Map every `Required behavior` and `Acceptance` item to its implementation and observed validation evidence, or its blocker.

Report rejected gaps and unresolved gaps separately.
Give a rationale for every rejection.

List blocked behavior, assumptions, and the decision ledger.
Classify validation as new-behavior coverage, regression coverage, or manual verification.
Name every untested item.

Reporting is complete when the report accounts for every task item, decision, blocker, and unresolved gap.
