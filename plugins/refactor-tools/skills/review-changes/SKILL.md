---
name: review-changes
description: >-
  Review changed code across six scored quality dimensions with observed or inferred evidence.
  Use for diffs, working-tree changes, commits, named files, merge readiness, or requirement compliance.
---

# Review Changed Code

Perform a read-only review.
Preserve every pre-existing working-tree change.

## Step 1 - Select the scope

Use the first available source:

1. Files, commits, or revision ranges that the user names.
2. Staged changes from `git diff --cached`.
3. Unstaged changes from `git diff`.
4. The latest commit from `git show HEAD`.

Read the selected diff and record its source and revisions.
Exclude binaries, lockfiles, build output, and vendored files from detailed review.
Record every exclusion and its reason.
If no repository or reviewable file exists, ask for a scope and stop.

Done when the diff is recorded and every changed file is selected or excluded with a reason.

## Step 2 - Trace the blast radius

Look for `AGENTS.md`, `.github/copilot-instructions.md`, `CLAUDE.md`, and `.cursorrules`.
Load the first available guide in that order.
Treat guide violations as findings.

For every hunk:

- Read its enclosing code and the helpers, types, and configuration it uses.
- Trace each changed public symbol, signature, and configuration key to its consumers.
- Read relevant tests and identify changed behavior without proof.

If the user supplied requirements, check every acceptance criterion and non-goal.
Report unmet criteria and out-of-scope work.
Otherwise, assess only the six quality dimensions.

Done when every hunk's effects, applicable dependencies, and tests are accounted for.

## Step 3 - Verify claims

Record the initial `git status --short` output.
Find project checks in scripts, task files, manifests, or the contributing guide.
Run the narrowest checks that cover the changes.
Widen the checks only to diagnose a failure.
Use an isolated temporary copy of the selected change for every command that can write files.

Classify each finding:

- **observed** - quote a command result or a complete code trace.
- **inferred** - name the settling command and why it was not run.

Run a cheap settling command when it is safe and available.

Apply a **negative control** to the change's central proof in an isolated copy.
Disable the changed mechanism by removing a guard, setup entry, or equivalent behavior.
Confirm that the relevant tests fail for the expected reason.
If no runnable proof exists, record that absence under validation.

Record deploy, publish, migration, and shared-environment commands as not run.
Confirm that final `git status --short` output matches the initial output.

Done when:

- All applicable safe checks have run and every result is recorded.
- Every finding has observed or inferred evidence.
- The central proof faced a negative control or has no runnable proof.
- The working tree matches its initial state.

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
| 10 | No finding. |
| 8-9 | Nits only. |
| 6-7 | One weakness to fix soon. |
| 4-5 | A defect to fix before merge. |
| 2-3 | Several defects, or one unsafe-to-ship defect. |
| 1 | The change fails this dimension. |

Use the higher score in a range for isolated impact.
Use the lower score for cross-cutting impact.
Use `n/a` only when the change cannot affect that dimension.
Name every sub-10 cause and explain every `n/a` in the score table's `Why` column.

Done when all six dimensions have a traceable score or justified `n/a`.

## Step 5 - Report

Rank findings by concrete cost.
Report at most five findings in full.
Put each additional finding on one line under `Also noted`.
Put each reviewer verification gap in the affected finding's `Evidence` line.
Use `Remaining risk` only for untested behavior in the change.
State successful checks against supplied requirements in `Result`.

```md
## Result

<Two or three sentences about the change and merge readiness.>

Scope: <source and revision or file set>

| Dimension | Score | Why |
| --- | --- | --- |
| Quality | N | <cause or "no finding"> |
| Security | N | |
| Simplicity | N | |
| Robustness | N | |
| Scalability | N | |
| Maintainability | N | |

## Findings

### 1. <short title> [dimension]

- Where: `path/to/file:line`
- Cost: <concrete failure and trigger>
- Evidence: observed - `<command>` -> <quoted result> | inferred - `<command>` was not run because <reason>
- Fix: <concrete change>

## Also noted

- <finding> - `path/to/file:line`

## Files reviewed

- `path/to/file` (+N/-N) - <change summary>
- Dropped: `path` - <reason>

## Validation observed

- `<command>` in `<directory>` -> <result>
- Negative control: `<disabled mechanism>` -> <expected failure or unexpected pass>
- Not run: `<command>` - <reason>

## Remaining risk

- <untested behavior in the change>
```

Omit empty sections.
If there are no findings, say so and retain the scores and validation.
Report only concrete, checkable costs.
