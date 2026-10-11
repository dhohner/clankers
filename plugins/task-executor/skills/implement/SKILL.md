---
name: implement
description: >-
  Implements one `to-agent-tasks` task through red-green TDD and independent requirement verification.
  Use when executing a named task file.
---

# Implement an agent task

Treat the task file as the contract for its outcome, boundary, and validation.
Continue through implementation, verification, reporting, and task state recording.
Implement agreed requirements without further approval, and settle routine choices from repository evidence.

A material decision is an unresolved choice affecting required behavior, a public or persisted contract, security, external state, or scope.
Ask the user directly about ambiguous task selection, missing required sections, or unresolved material decisions.
Ask about accepting uncovered items only after reporting.

## Select the task

Select the named task, or the sole task in `action-items/agent-tasks/`.
If neither identifies one task, present the candidates and ask the user to select one.

Require `Outcome`, `Required behavior`, `Acceptance`, and `Validation` sections.
Record the `HEAD` commit and every existing working tree change.
Track files changed for the task and limit verifier verdicts to them.

Modify only `May change` content and preserve every `Must preserve` property.
Exclude only the behavior each `Blockers` item names, and record it as blocked behavior.
Create a decision ledger with one entry per `Executor choices` item.

## Implement through TDD

Before implementing any unblocked requirement, load the installed `tdd` skill through the host's skill tool or catalog entrypoint.
Use `task-executor:tdd` for namespaced plugins; otherwise use its catalog name.
If it is missing or disabled, stop and report the required setup.

Apply the TDD loop to every runnable check for unblocked `Required behavior` and `Acceptance` items.
Map every check and its evidence to its task item.
When a check has no runnable harness, record the reason and use the item's `Validation` manual check if available.
Record each material choice and its rationale in the ledger.

Before running validation commands, determine their side effects and target environment.
Require explicit authorization before deploying or mutating shared or remote state.
Use existing authorization when the requested task explicitly supplies it.

A listed validation command alone does not authorize changes to shared or remote state.
Ask for missing authorization before running those commands.
If authorization is denied or unavailable, record the command and affected task items as blocked.

Run all safe, authorized task `Validation` commands and fix failures within scope through TDD.
Apply these rules to verifier commands too.

Continue to verification and reporting with unavailable checks recorded as uncovered, including their reasons.
Do not count an unavailable check as passed.

## Verify coverage

Run up to the user's verification limit of verifier passes, or three by default.
For each pass, send a fresh verifier subagent the canonical verifier prompt below.
Fill its placeholders from the current task result.

Give every reported gap one disposition before the next pass:

- Fix valid gaps within scope through the TDD loop.
- Settle gaps in the ledger when `Executor choices` delegates them or repository evidence supports a routine, reversible choice.
- Reject a gap only with boundary evidence and rationale.
- Pause and ask the user when a gap exposes an unresolved material decision.

Send the fixes, ledger, blocked behavior, and rejected gaps to the next fresh verifier.
Continue until a verifier reports no gaps and results for every probed state, or the pass limit is reached.
At the limit, record every remaining gap's disposition and every missing probe result before reporting.

## Report the result

Map every `Required behavior` and `Acceptance` item to its implementation and observed validation evidence, or its blocker.
Report rejected gaps with their rationale, and list unresolved gaps separately.
List blocked behavior, assumptions, and the decision ledger.
Classify validation as new-behavior coverage, regression coverage, or manual verification.
Name every untested item.

## Record the task state

Frontmatter starts with `---` on line 1, contains YAML keys `depends_on` and `state`, and ends with another `---` line.

Leave the task file unchanged if it lacks frontmatter, its `state` differs from `pending`, or a material decision stopped execution.
Never add frontmatter.

Full coverage requires the final verifier to report no gaps.
It must classify every `Required behavior` and `Acceptance` item as covered.
With full coverage, replace `state: pending` with `state: done`.

Otherwise, after reporting, ask whether the user accepts uncovered items.
These include remaining gaps, blocked behavior, and items without observed evidence.
Change the line only after acceptance; otherwise, leave the file unchanged.
Preserve every other byte.

## Canonical verifier prompt

For verifier preparation, read only this section.
Send each fresh verifier the block below unchanged except for filled placeholders.

```text
Verify <task file path> against changes in <changed files>.
Read the task, changed code, tests, and recorded decisions.
Decision ledger:
<ledger, or "None">
Blocked behavior:
<behavior and its blocker, or "None">
Validation boundaries:
<commands, targets, side effects, and authorization status>
Prior rejected gaps:
<gap, boundary evidence, and rationale, or "None">
Treat ledger entries as binding when Executor choices delegates them or repository evidence supports them as routine and reversible.
Flag choices affecting required behavior, a public or persisted contract, security, external state, or scope unless the task or a binding ledger entry resolves them.
Reassess every rejected gap independently.
Classify every Required behavior and Acceptance item as covered, blocked, or a gap.
Covered requires implementation plus observed test or Validation evidence.
Run the task's Validation commands only within the supplied target and authorization boundaries.
Use only safe, authorized commands for every probe.
Report unavailable commands and affected task items as blocked, with their reasons.
List states the change creates, such as new inputs, error paths, partial failures, and interactions with existing behavior.
Probe each state adversarially: assume it hides a security, data integrity, or Must preserve defect until evidence rules one out.
Exercise a state with safe commands where a harness exists; otherwise, inspect the code.
Preserve the working tree and make no edits.
Report each classification with evidence.
Report each probed state's method and result.
Report each gap with its location and the missing behavior or observed defect.
```
