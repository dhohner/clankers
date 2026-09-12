---
name: review-changes
description: >-
  Review changed code across six scored quality dimensions without editing it.
  Use when asked to review a diff, commit, staged changes, named files, or merge readiness.
---

# Review changed code

Review without editing, and preserve every pre-existing working-tree change.

Before running any command, read [verification](references/verification.md).
Before writing the report, read [report format](references/report-format.md).
Work through scope, blast radius, verification, scoring, and the report in that order.

## Scope

Select the scope from the request:

- A commit or range: its diff, with the base and target revisions recorded.
- Named files: their pending changes, or their full contents when unchanged or outside Git.
- Staged only: the index diff against `HEAD`.
- Unstaged only: the working-tree diff against the index.
- The working tree, or an unspecified scope: staged and unstaged tracked changes.

Include untracked files only when the user names them or asks for untracked changes.

When the scope is only partly clear, review the unambiguous subset and record the limitation under `Remaining risk`.
When it resolves to nothing, report the empty scope and ask for a scope instead of falling back to `HEAD`.

Skip exhaustive inspection of binaries, lockfiles, build output, and vendored files.
Inspect relevant dependency changes, provenance, and regeneration consistency instead.
Record every excluded file or change category, the reason, and any limited inspection.

## Blast radius

Load every applicable `AGENTS.md`, `.github/copilot-instructions.md`, `CLAUDE.md`, and `.cursorrules`, including ancestor and nested guides.
Respect each guide's scope and stated precedence.
Report every mandatory rule violation as a defect.
Report an unmet advisory preference only when it carries concrete impact.

For an unresolved conflict between guides, apply the stricter compatible rule and record the conflict under `Remaining risk`.
If no compatible reading exists, mark the affected assessment unresolved and review the remaining scope.

For every hunk, or every code unit in a full-file review:

- Read its enclosing code and the helpers, types, and configuration it uses.
- Trace each changed public symbol, signature, and configuration key to its consumers.
- Read the relevant tests and identify changed behavior that no test proves.

When the user supplied requirements, check every acceptance criterion and non-goal, and report unmet criteria and out-of-scope work.
Otherwise assess only the six quality dimensions.

## Score

Assess the full scope against each dimension:

| Dimension | Question | Inspect |
| --- | --- | --- |
| Quality | Does the change do the right thing? | Real inputs, boundaries, errors, validation, discarded errors, and behavior coverage. |
| Security | What can an attacker gain? | Injection paths, access checks, secrets, unsafe paths, and sensitive outputs. |
| Simplicity | Is this the smallest clear solution? | Duplication, indirection, unused options, dead branches, and needless cleverness. |
| Robustness | What happens when it fails? | Partial failure, retries, timeouts, concurrency, cleanup, test order, and external state. |
| Scalability | What happens at 100 times the load? | Complexity, repeated I/O, unbounded growth, chatty calls, and lock contention. |
| Maintainability | What does the next reader pay? | Naming, useful comments, current docs, coupling, interfaces, and stored formats. |

Report each defect once, under the dimension it damages most.
Give every applicable dimension a score:

| Score | Meaning |
| --- | --- |
| 10 | No finding within the scope and stated coverage. |
| 8-9 | Nits only. |
| 6-7 | One weakness to fix soon. |
| 4-5 | A defect to fix before merge. |
| 2-3 | Several defects, or one unsafe-to-ship defect. |
| 1 | The change fails this dimension. |

Within a score range, use the higher score for isolated impact and the lower score for cross-cutting impact.
Use `n/a` only when the change cannot affect that dimension.
Name every sub-10 cause and explain every `n/a` in the score table's `Why` column.

Scores summarize findings, not certainty or merge readiness.
State each dimension's coverage limits and confidence.
Confidence is high for direct checks or complete traces over the relevant paths, medium for partial coverage, and low for substantial gaps.

Classify each finding separately:

- Blocker - a demonstrated or well-supported failure requiring a pre-merge fix, including exploitable security defects or data loss.
- Follow-up - a concrete weakness that does not block the intended release.
- Nit - a local clarity or convention issue without behavioral impact.

Cap a dimension's score at 5 for blockers and 7 for follow-ups.
Explain the trigger and impact justifying each severity.
Withhold a merge-readiness verdict when an unresolved verification gap could conceal a blocker.

## Completion

The review is complete when:

- Every in-scope file is reviewed or excluded with a recorded reason.
- Every applicable check has a result or a specific skip reason.
- The negative control has an outcome or a skip reason.
- Every finding has an evidence type, its verification limits, and a severity.
- All six dimensions have a traceable score or a justified `n/a`, with confidence and coverage limits.
- The preservation comparison records every difference or confirms none.
- The report follows the template and covers scope, scores, all blockers, evidence, validation results, and applicable limits.
