# Normal mode

Continue through implementation, verification, reporting, and task state recording.
Resolve gaps within scope until coverage is complete or the verification limit is reached.
At a decision gate, ask the user directly without returning a `stop` message.

## Select and implement the task

Follow [Select and gate the task](shared-rules.md#select-and-gate-the-task) through its completion criterion.
Then follow [Implement with TDD](shared-rules.md#implement-with-tdd) through its completion criterion.
Continue to verification after implementation.

## Verify requirement coverage

Run up to the user's verification limit of verifier passes, or three by default.
Run each pass in a fresh verifier subagent with this prompt:

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

Before the next pass, apply [Gap dispositions](shared-rules.md#gap-dispositions) to every gap.
Send the fixes, ledger, blocked behavior, and rejected gaps to a fresh verifier.
Repeat until a verifier reports no gaps or the pass limit is reached.
Record every gap remaining after the final pass.

Verification is complete when a verifier reports no gaps and a result for every probed state, or every gap left after the final pass has a recorded disposition.

## Report

Map every `Required behavior` and `Acceptance` item to its implementation and observed validation evidence, or its blocker.

Report rejected gaps and unresolved gaps separately.
Give a rationale for every rejection.

List blocked behavior, assumptions, and the decision ledger.
Classify validation as new-behavior coverage, regression coverage, or manual verification.
Name every untested item.

Reporting is complete when the report accounts for every task item, decision, blocker, and unresolved gap.

## Record the task state

Frontmatter starts with `---` on line 1, contains YAML keys `depends_on` and `state`, and ends with another `---` line.

Leave the task file unchanged if it lacks frontmatter, its `state` differs from `pending`, or a material decision stopped execution.
Never add frontmatter.

Full coverage requires the final verifier to report no gaps and classify every `Required behavior` and `Acceptance` item as covered.
With full coverage, replace `state: pending` with `state: done`.

Otherwise, after reporting, ask whether the user accepts uncovered items.
These include remaining gaps, blocked behavior, and items without observed evidence.
Change the line only after acceptance; otherwise, leave the file unchanged.

Preserve every other byte.

Recording is complete when the task file holds `state: done` for an accepted result, or its original content otherwise.
