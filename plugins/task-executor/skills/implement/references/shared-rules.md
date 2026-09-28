# Shared task rules

## Select and gate the task

Select the named task, or the sole task in `action-items/agent-tasks/`.
If neither identifies one task, stop with the candidate list.

Require `Outcome`, `Required behavior`, `Acceptance`, and `Validation` sections.
Record the `HEAD` commit and every existing change in the working tree.
Track files changed for the task and limit verifier verdicts to them.

Modify only `May change` content and preserve every `Must preserve` property.
Exclude only the behavior each `Blockers` item names, and record it as blocked behavior.
Create a decision ledger with one entry per `Executor choices` item.

Selection is complete when one task passes the structure gate, with its baseline, blocked behavior, and ledger recorded.

## Implement with TDD

Apply this plugin's `tdd` skill to every unblocked `Required behavior` and `Acceptance` item.
Use `task-executor:tdd` where plugin skills are namespaced.
When the skill tool is unavailable, read [the TDD skill](../../tdd/SKILL.md) to run its loop.

Map every check and its evidence back to its task item.
When a check has no runnable harness, record the reason and use the item's `Validation` manual check.
Record each material choice and its rationale in the ledger.
Run every task `Validation` command.

Implementation is complete when every check has red-green evidence or a recorded manual result, the ledger holds every material choice, and every validation command passes.

## Gap dispositions

Give every gap one disposition:

- Fix valid gaps within scope through the TDD loop.
- Settle gaps in the ledger when `Executor choices` delegates them or repository evidence supports a routine, reversible choice.
- Reject a gap only with boundary evidence and rationale.
- Stop at a gap that exposes an unresolved material decision.
