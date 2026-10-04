# Normal mode

Continue through implementation, verification, reporting, and task state recording.
Resolve gaps within scope until coverage is complete or the verification limit is reached.
At a decision gate, ask the user directly without returning a `stop` message.

## Select and implement the task

Apply the shared selection and gating rules through their completion criterion.
Then apply the shared TDD implementation rules through their completion criterion.
Continue to verification after implementation.

## Verify requirement coverage

Run up to the user's verification limit of verifier passes, or three by default.
For each pass, send a fresh verifier subagent the canonical verifier prompt.
Fill its placeholders from the current task result.

Before the next pass, apply the shared gap disposition rules to every gap.
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
