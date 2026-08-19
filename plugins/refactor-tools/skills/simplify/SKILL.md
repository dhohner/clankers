---
name: simplify
description: Simplify existing code while preserving behavior and edit scope.
disable-model-invocation: true
---

# Simplify Changed Code

Apply safe simplifications instead of only reviewing code.
Preserve intended behavior and the user's momentum.
Leave ambiguous or risky changes for the user.

An **edit region** is the smallest coherent unit that contains a changed hunk.
Typical units are a function, method, class member, test case, or local block.
Default to edit regions unless the user requests whole-file cleanup.

Use another workflow for findings-only reviews, features, bug hunts, or architecture redesigns.

## 1. Determine scope

Treat text after the invocation as focus guidance.

Select files in this order:

1. Use any user-specified files, directories, commits, or revision ranges.
2. Otherwise, use staged files from `git diff --cached --name-only`.
3. Otherwise, use latest-commit files from `git show --name-only --pretty='' HEAD`.

Ask the user for files and stop when Git scope detection fails or produces an unusable result.

Exclude binary files, generated artifacts, lockfiles, and sourcemaps.
Also exclude vendored directories such as `node_modules/` and `vendor/`.

If no eligible files remain, respond exactly:

`No eligible files found in the selected scope.`

If the scope exceeds 15 files, list the files and request narrowing or batches.

Derive the selected diff and map each hunk to its edit region.
Use each edit region as the default boundary.
Widen only for required helpers, imports, types, or adjacent duplicated branches.

If the map is unavailable, ask for a current diff, revision range, or whole-file pass.
Honor an explicit whole-file request and record it in the report.

Capture target-file status and current diffs as the **baseline** before editing.
Preserve baseline changes and distinguish them from skill edits.

Scope is complete when every eligible file has an edit-region map and a recorded baseline.
Record every excluded file and its reason.

## 2. Load project rules

Load every rules file that governs each target file.
Search from the repository root through each target directory for `AGENTS.md` and `CLAUDE.md`.
Also load applicable `.github/copilot-instructions.md` and `.cursorrules` files.
Use repository-defined precedence when available.
Otherwise, let rules nearest the target override broader rules.

Extract enforceable naming, structure, pattern, and prohibition rules.
If no rules exist, use language conventions and standard linter guidance.

Rule loading is complete when every target file has a resolved rule set or the documented fallback.

## 3. Run three review passes

Read enough context to understand every edit region safely.
Run exactly three independent passes with the same input package.
Run the passes in parallel when isolated pass tools exist.

Read [the finding template](references/finding-template.md) before running the passes.
Include this input in every pass:

- Include the edit-region map and sufficient surrounding context.
- Include applicable project rules or `none found - use general best practices`.
- Include the user's focus guidance when present.
- Require the referenced output format.

Keep findings inside edit regions.
Allow adjacent findings only when they directly support safe cleanup.
Reserve unrelated whole-file findings for an explicit broad request.

### 3.1. Code Reuse

Find duplicated logic, repeated literals, useful shared helpers, and copied parameter-only branches.
Keep explicit test fixtures and small one-off paths when they are clearer.

### 3.2. Code Quality

Find weak names, mixed responsibilities, deep nesting, and feature envy.
Also find comment defects, dead code, and project-rule violations.
Replace clever structures when direct code is clearer.

### 3.3. Efficiency

Find avoidable loop work, repeated I/O, and redundant computation.
Also find dead paths and material complexity improvements.
Use batching, caching, streaming, or lazy evaluation only for practical, material gains.

Review is complete when all three passes cover each edit region and return the required output.

## 4. Resolve findings

Process findings in this order:

1. Merge findings about the same line, symbol, or cause, and keep the clearest suggestion.
2. Resolve conflicts in favor of the smaller, safer change.
3. Leave unresolved conflicts unchanged and report both suggestions.
4. Prioritize findings that match the user's focus.

Apply findings by confidence and risk:

- Apply `high` confidence and `safe` risk findings.
- Apply `medium` confidence and `safe` risk findings only with targeted deterministic coverage.
- Leave `low` confidence, `caution`, and `risky` findings unchanged.

Resolution is complete when every distinct finding has one apply or leave-unchanged decision.

## 5. Apply fixes

Prefer targeted refactors to broad rewrites.
Edit only edit regions and the minimum adjacent code required for coherence.
Preserve public APIs, exports, signatures, and intended behavior.
Change them only on an explicit user request.
Keep repetition when abstraction would reduce clarity.

Update tests only when the refactor requires focused matching changes.
Preserve test intent, coverage, and assertion strength.
Keep skill edits unstaged.

Editing is complete when each apply decision is implemented and the baseline remains intact.

## 6. Validate

Run the narrowest relevant tests, type checks, and linters after editing.
Inspect commands first and use only local validation without remote or shared side effects.
Retain a medium-confidence fix only when targeted validation covers its behavior and passes.
When a check fails and causality is unclear, reverse the candidate edit and rerun the failed check.
If the failure persists, restore the candidate edit and report the failure as unrelated.
Fix or reverse only the responsible skill edit when validation fails.
Report actual commands, outcomes, coverage, and untested behavior.

Validation is complete when every applicable check has a recorded result and all gaps are reported.

## 7. Report completion

Follow one report template exactly:

- Read [standard report](references/standard-report.md) when a fix or unchanged finding exists.
- Read [no-change report](references/no-change-report.md) when no meaningful finding exists.

Replace its placeholders with observed values.
List incidental out-of-scope findings under `LEFT UNCHANGED` with a `scope` reason.

Reporting is complete when the report accounts for every finding, edit, check, and exclusion.
