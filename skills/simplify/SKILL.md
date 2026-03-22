---
name: simplify
description: Apply safe, behavior-preserving cleanup edits to existing code by selecting a scope, reviewing for duplication, readability, and meaningful efficiency issues, then summarizing what was changed versus left manual. Use this skill whenever the user asks to simplify, clean up, refactor, streamline, de-duplicate, polish, or make existing code more maintainable, readable, or efficient, especially for staged changes, the latest commit, or explicitly named files after a feature or bug fix, even if they do not explicitly say "simplify." Also use it when the user wants safe cleanup with edits plus a structured report of risky follow-ups. Do not use it for review-only requests, debugging, new feature work, or broad architectural redesign.
---

# Simplify Changed Code

Use this skill to clean up existing code without changing intended behavior.

The job is not just to review. The job is to identify safe simplifications, apply the ones that are clearly behavior-preserving, and leave the risky or ambiguous items for the user.

## What this skill should optimize for

- Reduce duplication and repeated literals where abstraction improves clarity.
- Improve readability, structure, and maintainability.
- Remove avoidable inefficiencies that matter in practice.
- Keep the scope tight to the selected files.
- Preserve behavior, public APIs, and the user's momentum.

## When not to use this skill

Do not use this skill when the user primarily wants:

- A review with findings only and no edits.
- A new feature or a bug investigation.
- Broad architectural redesign.
- Risky API changes or semantic rewrites.

## Inputs to capture

Before doing any cleanup, determine:

- Whether the user specified files, directories, a commit, or a revision range.
- Whether the user gave focus guidance such as readability, memory efficiency, or duplication.
- Whether the repo defines enforceable conventions in a project rules file.

If the user includes extra text after invoking the workflow, treat that text as focus guidance and prioritize matching concerns first.

## Workflow

### Step 1 - Determine target files

Use this fallback order:

1. If the user specifies files, a commit, or a range, use that exact scope.
2. Else use staged changes via `git diff --cached --name-only`.
3. Else use files from the latest commit via `git show --name-only --pretty='' HEAD`.

If git-based scope detection fails because the directory is not a git repo, the repo has no commits, or the result is otherwise unusable, ask the user to specify files manually and stop.

Apply these filtering rules:

- Exclude binary files.
- Exclude generated files such as lockfiles, `.min.js`, sourcemaps, and build artifacts.
- Exclude vendored dependencies such as `node_modules/` and `vendor/`.

If no eligible files remain, respond with exactly:

`No eligible files found in the selected scope.`

If more than 15 files remain, list them and ask the user to confirm before proceeding. Offer to narrow the scope to a directory or smaller file set.

### Step 2 - Load project rules

Look for project rules in this order:

1. `AGENTS.md`
2. `.github/copilot-instructions.md`
3. `CLAUDE.md`
4. `.cursorrules`

Use the first file found and extract enforceable conventions such as naming, structure, preferred patterns, and forbidden practices.

If no rules file exists, continue with language-idiomatic conventions and normal linter sensibilities. In the final report, state:

`No project rules file found - using general best practices.`

### Step 3 - Run three focused review passes in parallel

Read the full content of every target file unless a file is so large that using a diff is materially more practical.

Then run exactly three review passes in parallel using the same input package for each pass.

Shared input for every pass:

- The full content of each target file, or the diff for very large files.
- The extracted project rules, or `none found - use general best practices`.
- The user's focus guidance, if any.
- The instruction to return a markdown list of findings using the required format below, or an empty list if nothing meaningful is found.

Required finding format:

```md
- **file**: `path/to/file`
  **line**: L or L-L range
  **issue**: one-sentence description of the problem
  **suggestion**: concrete code change or refactor to apply
  **confidence**: high | medium | low
  **risk**: safe | caution | risky
```

Interpret the risk labels this way:

- `safe`: behavior-preserving.
- `caution`: could change behavior.
- `risky`: changes public API or semantics.

Run these three passes:

#### Code Reuse pass

Look for:

- Duplicated or near-duplicated logic across files or within one file.
- Repeated literals that should become named constants.
- Code that should become a shared helper, utility, or base abstraction.
- Copy-pasted branches that differ only by parameters.

Do not flag repetition that is clearer left explicit, such as test fixtures or tiny, readable one-off code paths.

#### Code Quality pass

Look for:

- Misleading or low-signal names.
- Functions doing too many things.
- Structural issues such as deep nesting or feature envy.
- Missing, stale, or misleading comments.
- Commented-out dead code.
- Unnecessarily clever code that harms readability.
- Violations of project rules.

#### Efficiency pass

Look for:

- Unnecessary allocations, copies, or conversions in loops.
- Repeated I/O or query patterns that should be batched.
- Algorithmic issues where a simpler complexity class is available.
- Redundant computation or dead code paths.
- Places where caching, streaming, or lazy evaluation would materially help.

Do not micro-optimize code that is unlikely to matter.

### Step 4 - Aggregate and resolve findings

After the three passes complete:

1. Deduplicate overlapping findings that point at the same line, symbol, or underlying issue.
2. Merge duplicates into one item and keep the most concrete suggestion.
3. Detect contradictory suggestions. If two ideas conflict, prefer the smaller and safer change.
4. If a conflict cannot be resolved safely, leave it unchanged and record both suggestions for the user.
5. Prioritize items that match the user's focus guidance.

Apply this filter before editing:

- Auto-apply `high` confidence plus `safe` risk fixes.
- Auto-apply `medium` confidence plus `safe` risk fixes, but call them out in the report.
- Do not auto-apply `low` confidence findings.
- Do not auto-apply `caution` or `risky` findings.

### Step 5 - Apply fixes

When editing:

- Prefer small, targeted refactors over broad rewrites.
- Do not change public APIs, exports, function signatures, or intended behavior unless the user explicitly asked for that.
- Do not remove or rewrite tests. If test code has issues, report them in `LEFT UNCHANGED` instead.
- Keep all resulting changes unstaged so the user can inspect them.

### Step 6 - Return a completion report

Use this exact section structure:

```md
**SCOPE**

- Source: staged changes | last commit | user-specified scope
- Files processed: N
- Files skipped: N (with reasons if any were filtered)
- Project rules: `filename` | none found
- Focus: `<user focus text>` | none

**AGENT FINDINGS**

- Code Reuse: N findings (N high, N medium, N low)
- Code Quality: N findings (N high, N medium, N low)
- Efficiency: N findings (N high, N medium, N low)

**APPLIED FIXES**

- [ ] `file:line` - what changed - why - confidence

**LEFT UNCHANGED**

- [ ] `file:line` - reason not auto-fixed (low confidence | risk | conflict | test code)

**SUMMARY**

- Total fixes applied: N
- Remaining manual items: N
- Confidence: High | Medium | Low
- Rollback: `git checkout -- <files>` to undo all changes
```

If no meaningful improvements are found, respond with exactly:

`No material simplifications found in the selected changes.`

## Practical guidance

- Behavior preservation matters more than elegance.
- Do not force abstractions where a small amount of repetition is clearer.
- Make the user's review easy: few files touched, clear diffs, low-risk edits.
- When the user gave focus guidance, resolve those items first even if other safe cleanups also exist.
