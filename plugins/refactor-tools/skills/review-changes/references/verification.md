# Verification

## Preservation baseline

Capture the baseline before running any check.
Record repository-wide porcelain status and index entries with modes.
Record content fingerprints and modes only for changed tracked files, non-ignored untracked files, and files outside Git.
Keep the baseline outside the repository, and never print secret contents.

## Choosing commands

Before executing check scripts, inspect them and their dependencies for filesystem writes, credential access, network calls, and shared-service effects.
A temporary directory does not isolate a command from credentials or external services.
Record deploy, publish, migration, and shared-environment commands as not run.
Skip any command whose side effects you cannot safely bound, and record why.

Local test, lint, and type checks that run inside a disposable snapshot need no approval at each step.
Run the narrowest safe set of checks that covers the changes.
Confirm the test filters select the intended files.
Widen the checks only to diagnose a failure.

## Snapshots

Run every potentially file-writing command in an isolated temporary snapshot.
Match the snapshot to the selected revision, index state, or combined working-tree state, including relevant untracked dependencies.
Exclude unstaged changes from a staged-only snapshot.
Record the snapshot source, its included dependencies, and any mismatch that limits the results.

## Evidence

Label each result as compilation, regression coverage, new-behavior coverage, or manual verification.
Do not infer new-behavior correctness from compilation, pre-existing tests, or static inspection alone.

Classify each finding's evidence:

- Executed - quotes a redacted command result, and names the snapshot and the tested behavior.
- Static trace - gives the trigger, the code path, and the failure, with file and line references.
- Hypothesis - states the uncertainty, a settling check, and why that check was not run.

Run a cheap settling check whenever one is safe and available.
Redact secrets from every recorded output.

## Negative control

Use a bounded negative control when mutation can test whether the central proof detects the changed behavior.
Confirm the relevant test passes in the unchanged snapshot, then disable the changed mechanism and rerun that test.
Confirm the failure targets the claimed behavior rather than compilation, setup, or an unrelated dependency.
Report an unexpected pass as a proof gap rather than a product defect.

When mutation is unsafe, expensive, or ambiguous, record the skipped control and the reason.
When no runnable proof exists, record its absence.

## Preservation comparison

Compare final status, index entries, content fingerprints, and file modes with the baseline.
Report unexpected mutations without restoring files, which another actor may have changed.
