---
name: review-changes
description: >-
  Review changed code across six scored quality dimensions with executed evidence, static traces, or hypotheses.
  Use for diffs, working-tree changes, commits, named files, merge readiness, or requirement compliance.
---

# Review changed code

Perform a read-only review.
Preserve every pre-existing working-tree change.

## Step 1 - Select the scope

Select the scope by intent:

- For named commits or ranges, review their diffs and record the base and target revisions.
- For named files, review their pending changes, or full contents if unchanged or outside Git.
- For staged-only requests, review the index diff against `HEAD`.
- For unstaged-only requests, review the working-tree diff against the index.
- For working-tree reviews or unspecified scope, include staged and unstaged tracked changes.
- Include untracked files only when the user names them or explicitly requests untracked changes.
- For an explicit latest-commit review, use `git show HEAD`.

Handle unclear scope:

- If the scope is ambiguous, ask for clarification.
  - If asking is impossible, review only the unambiguous subset and record the limitation under `Remaining risk`.
- If the scope is empty, ask for a scope and stop without falling back to `HEAD`.
  - If asking is impossible, report the empty scope without scores or a merge-readiness verdict, then stop.

Read the selected diff or files.

Before checks, capture repository-wide porcelain status and index entries, including modes.
Fingerprint contents and capture modes only for changed tracked files, non-ignored untracked files, and files outside Git.
Keep baseline metadata outside the repository, and never print secret contents.

Skip exhaustive inspection of binaries, lockfiles, build output, and vendored files.
Inspect relevant dependency changes, provenance, and regeneration consistency instead.
Record every excluded file or change category, the reason, and any limited inspection.

Done when every in-scope file is selected or excluded with a reason, and the baseline is recorded.

## Step 2 - Trace the blast radius

Load every applicable `AGENTS.md`, `.github/copilot-instructions.md`, `CLAUDE.md`, and `.cursorrules`, including ancestor and nested guides.
Respect each guide's scope, instruction precedence, and explicit repository rules.

Ask about unresolved conflicts affecting the verdict.
If asking is impossible, apply the stricter compatible rule, record the conflict under `Remaining risk`, and continue.
If no compatible interpretation exists, mark the affected assessment unresolved and review the remaining scope.

Report every mandatory rule violation as a defect.
Report unmet advisory preferences only when they have concrete impact.

For every hunk, or each code unit in a full-file review:

- Read its enclosing code and the helpers, types, and configuration it uses.
- Trace each changed public symbol, signature, and configuration key to its consumers.
- Read relevant tests and identify changed behavior without proof.

If the user supplied requirements, check every acceptance criterion and non-goal.
Report unmet criteria and out-of-scope work.
Otherwise, assess only the six quality dimensions.

Done when every hunk's effects, applicable dependencies, and tests are accounted for.

## Step 3 - Verify claims

Before execution, inspect check scripts and dependencies for filesystem writes, credential access, network calls, and shared-service effects.
Do not treat a temporary directory as isolation from credentials or external services.
Record deploy, publish, migration, and shared-environment commands as not run.

Skip commands with side effects you cannot safely bound, and record why.

Run every potentially file-writing command in an isolated temporary snapshot.
Match the snapshot to the selected revision, index state, or combined working-tree state, including relevant untracked dependencies.
Exclude unstaged changes from staged-only snapshots.

Record the snapshot source, included dependencies, and mismatches limiting results.

Run the narrowest safe checks that cover the changes.
Confirm test filters select the intended files, citing available file and test counts.
Widen checks only to diagnose a failure.

Label results as compilation, regression coverage, new-behavior coverage, or manual verification.
Do not infer new-behavior correctness from compilation, pre-existing tests, or static inspection alone.

Classify each finding's evidence:

- Executed evidence quotes a redacted command result and names the snapshot and tested behavior.
- A static trace gives the trigger, code path, and failure with file and line references.
- A hypothesis states the uncertainty, a settling check, and why it was not run.

Run a cheap settling check when safe and available.
Redact secrets from all recorded output.

Use a safe, bounded negative control when mutation can test whether the central proof detects the changed behavior.
Confirm the relevant test passes in the unchanged snapshot before disabling the changed mechanism and rerunning the test.

Confirm failure targets the claimed behavior, not compilation, setup, or an unrelated dependency.
Report an unexpected pass as a proof gap, not automatically a product defect.

If mutation is unsafe, expensive, or ambiguous, record the skipped control and reason.
If no runnable proof exists, record its absence.

Compare final status, index entries, content fingerprints, and file modes with the preservation baseline.
Report unexpected mutations without restoring files, which another actor may have changed.

Done when:

- Every applicable check has a recorded result or specific skip reason.
- Every finding has an evidence type and verification limits.
- The negative control has an outcome or explicit skip reason.
- The preservation comparison records every difference or confirms none.

## Step 4 - Review and score

Assess the full scope against each dimension:

| Dimension | Question | Inspect |
| --- | --- | --- |
| Quality | Does the change do the right thing? | Real inputs, boundaries, errors, validation, discarded errors, and behavior coverage. |
| Security | What can an attacker gain? | Injection paths, access checks, secrets, unsafe paths, and sensitive outputs. |
| Simplicity | Is this the smallest clear solution? | Duplication, indirection, unused options, dead branches, and needless cleverness. |
| Robustness | What happens when it fails? | Partial failure, retries, timeouts, concurrency, cleanup, test order, and external state. |
| Scalability | What happens at 100 times the load? | Complexity, repeated I/O, unbounded growth, chatty calls, and lock contention. |
| Maintainability | What does the next reader pay? | Naming, useful comments, current docs, coupling, interfaces, and stored formats. |

Report each defect once under the dimension it damages most.
Give every applicable dimension a score:

| Score | Meaning |
| --- | --- |
| 10 | No finding within the scope and stated coverage. |
| 8-9 | Nits only. |
| 6-7 | One weakness to fix soon. |
| 4-5 | A defect to fix before merge. |
| 2-3 | Several defects, or one unsafe-to-ship defect. |
| 1 | The change fails this dimension. |

Within each score range, use the higher score for isolated impact and the lower score for cross-cutting impact.
Use `n/a` only when the change cannot affect that dimension.
Name every sub-10 cause and explain every `n/a` in the score table's `Why` column.

Scores summarize findings, not certainty or merge readiness.
State each dimension's confidence and coverage limits.

- Use high confidence for direct checks or complete traces covering relevant paths.
- Use medium confidence for partial coverage and low confidence for substantial gaps.

Classify each finding separately:

- Blocker - a demonstrated or well-supported failure requiring a pre-merge fix, including exploitable security defects or data loss.
- Follow-up - a concrete weakness that does not block the intended release.
- Nit - a local clarity or convention issue without behavioral impact.

Cap a dimension's score at 5 for blockers and 7 for follow-ups.
Explain the trigger and impact justifying severity.

Do not declare merge readiness when an unresolved verification gap could conceal a blocker.

Done when:

- All six dimensions have a traceable score or justified `n/a`, confidence, and coverage limits.
- Every finding has a severity.

## Step 5 - Report

Rank findings by severity, then concrete cost.
Report every blocker in full, even beyond five findings.
Fill remaining slots within five full findings with follow-ups and nits.

List additional non-blocking findings on one line each under `Also noted`.
Include each reviewer verification gap in the affected finding's `Evidence` line.
Use `Remaining risk` for untested behavior, scope limitations, and unresolved guide conflicts.

State successful checks against supplied requirements in `Result`.

````md
## Result

<Two or three sentences about the change and merge readiness.>

Scope: <source and revision or file set>

| Dimension | Score | Why | Confidence | Coverage limits |
| --- | --- | --- | --- | --- |
| Quality | N | <cause or "no finding"> | high/medium/low | <limits or "none identified"> |
| Security | N | | | |
| Simplicity | N | | | |
| Robustness | N | | | |
| Scalability | N | | | |
| Maintainability | N | | | |

## Findings

### 1. <short title> [dimension, severity]

- Where: `path/to/file:line`
- Cost: <concrete failure and trigger, or violated mandatory rule with no established impact>
- Evidence: <Executed | Static trace | Hypothesis> - <support and limits>.
- Fix: <concrete change>

## Also noted

- <finding and severity> - `path/to/file:line` - <evidence type, support, and limits>.

## Files reviewed

- `path/to/file` (+N/-N) - <change summary>
- Dropped: `path` - <reason>

## Validation observed

- <validation category>: <command reference> in `<directory>` -> <result and selected file/test counts>.
- Snapshot: <source, included dependencies, and mismatches>.
- Negative control: <baseline pass and targeted failure, unexpected outcome, or skip reason>.
- Preservation: <baseline comparison and any differences>.

```sh
<executed commands>
```

## Not run

- <check or command reference> - <reason>.

## Remaining risk

- <untested behavior, scope limitation, or unresolved guide conflict>
````

Omit empty sections.
If there are no findings, say so and retain validation.
Retain scores only for a nonempty review scope.

Report concrete, checkable costs, or cite the violated mandatory rule when no concrete impact is established.

Done when the report contains scope, scores, all blockers, evidence, validation results, and applicable limits.
