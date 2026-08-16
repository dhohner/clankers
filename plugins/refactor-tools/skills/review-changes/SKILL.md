---
name: review-changes
description: Evidence-based scoring of changed code across five quality dimensions.
disable-model-invocation: true
---

# Review Changed Code

Leave the working tree unchanged.

## Step 1 - Select the scope

Use the first available source:

1. User-named files, commit, or revision range.
2. Staged changes: `git diff --cached --name-only`.
3. Unstaged changes: `git diff --name-only`.
4. Latest commit: `git show --name-only --pretty='' HEAD`.

Drop binaries, lockfiles, build output, and vendored files, and report each exclusion.
If no repository or reviewable file exists, ask for a scope and stop.

Done when: the selected scope is recorded and every file is reviewed or excluded with a reason.

## Step 2 - Trace the blast radius

For every hunk:

- Read its enclosing code and the helpers, types, and configuration it uses.
- Find callers of each changed public symbol, signature, and configuration key.
- Read relevant tests and identify uncovered changed behavior.

Load the first available repository guide in this order:

1. `AGENTS.md`.
2. `.github/copilot-instructions.md`.
3. `CLAUDE.md`.
4. `.cursorrules`.

Treat guide violations as findings.

If the user supplied requirements, check all acceptance criteria and non-goals.
Report missed criteria and out-of-scope work.
Otherwise, assess only the five quality dimensions.

Done when: every hunk's callers, callees, dependencies, and tests have been traced.

## Step 3 - Verify claims

Find project checks in scripts, task files, manifests, or the contributing guide.
Run the narrowest checks that cover the changes, widening only to diagnose failures.
Use a cheap probe to reproduce each suspected defect when possible.

Classify each finding:

- **observed** - quote a command result or end-to-end code trace.
- **inferred** - name the command that would settle a reading-based claim.

Run a cheap settling command instead of leaving its finding inferred.

Apply a **negative control** to the change's central proof.
Break its mechanism in a temporary copy by removing a guard, deleting a setup entry, or reverting the fix.
Confirm that its tests fail.
If no runnable proof exists, record that under validation.

Keep experiments outside the repository when possible.
Remove any in-repository probe and confirm cleanup with `git status`.
Run commands only when their effects remain in the working copy.
Record deploy, publish, migration, and shared-environment commands as not run.

Done when:

- All applicable checks have run.
- Every result and pre-existing failure is recorded.
- The central proof faced a negative control or has no runnable proof.

## Step 4 - Review and score

Assess the full scope against each dimension:

| Dimension | Question | Inspect |
| --- | --- | --- |
| Quality | Does the change do the right thing? | Real inputs, boundaries, error paths, input validation, discarded errors, and behavior coverage. |
| Simplicity | Is this the smallest clear solution? | Duplication, needless indirection, unused options, dead branches, overloaded parameters, and cleverness a plain form could replace. |
| Robustness | What happens when something goes wrong? | Partial failure, retries, timeouts, concurrency, cleanup, test order, and external-state dependence. |
| Scalability | What happens at 100 times the load? | Complexity, repeated I/O in loops, unbounded growth, chatty calls that should be batched, and lock contention. |
| Maintainability | What does the next reader pay? | Naming, useful comments, current docs, distant coupling, and interfaces or stored formats that resist later change. |

Report each defect once under the dimension it damages most.
Give each dimension a clean verdict or findings, then score it:

| Score | Meaning |
| --- | --- |
| 10 | No finding. |
| 8-9 | Nits only. |
| 6-7 | One weakness to fix soon. |
| 4-5 | A defect to fix before merge. |
| 2-3 | Several defects, or one unsafe-to-ship defect. |
| 1 | The change fails this dimension. |

Within each range, use the higher score for isolated impact and the lower score for cross-cutting impact.
In the score table's `Why` column, name each sub-10 cause.
Name the nit for 8-9 and the finding for 1-7.
Use `n/a` with a reason when the change cannot affect a dimension.

Done when: all five dimensions have a traceable score or justified `n/a`.

## Step 5 - Report

Rank findings by importance and report at most five in full.
Put additional findings as one-line entries under `Also noted`.
Put reviewer verification gaps in the affected finding's `Evidence` line.
Reserve `Remaining risk` for untested behavior in the change.

```md
## Result

<Two or three sentences about the change and merge readiness.>

Scope: <source and revision or file set>

| Dimension | Score | Why |
| --- | --- | --- |
| Quality | N | <cause or "no finding"> |
| Simplicity | N | |
| Robustness | N | |
| Scalability | N | |
| Maintainability | N | |

## Findings

### 1. <short title> [dimension]

- Where: `path/to/file:line`
- Cost: <concrete failure and trigger>
- Evidence: observed - `<command>` -> <quoted result> | inferred - <settling command>
- Fix: <concrete change>

## Also noted

- <finding> - `path/to/file:line`

## Files reviewed

- `path/to/file` (+N/-N) - <change summary>
- Dropped: `path` - <reason>

## Validation observed

- `<command>` in `<directory>` -> <result>
- Negative control: `<broken mechanism>` -> <failure or unexpected pass>
- Not run: `<command>` - <reason>

## Remaining risk

- <untested behavior in the change>
```

Omit empty sections.
If there are no findings, say so and retain scores and validation.
Report only concrete, checkable costs.
