---
agent: agent
name: simplify
description: Review recent changes with parallel specialist agents and apply cleanup fixes
---

/simplify reviews your recently changed files for code reuse, code quality, and efficiency issues, then fixes them.

Run it after implementing a feature or bug fix to clean up your work.

If the user provides extra text after `/simplify`, treat it as focus guidance and prioritize those concerns.
Example: `/simplify focus on memory efficiency`

## Workflow

### Step 1 — Determine Target Files

Use this fallback order:

1. If the user specifies files, a commit, or a range, use that exact scope.
2. Else use staged changes: `git diff --cached --name-only`.
3. Else use files from the latest commit: `git show --name-only --pretty='' HEAD`.

If git commands fail (not a git repo, empty repo, detached HEAD with no commits), ask the user to specify files manually and stop.

**Filtering rules:**
- Exclude binary files, generated files (lockfiles, `.min.js`, sourcemaps, build output), and vendored dependencies (`node_modules/`, `vendor/`, etc.).
- If the resulting file list is empty, respond: `No eligible files found in the selected scope.`

**Scope guard:**
- If more than 15 files are in scope, list them and ask the user to confirm before proceeding, or suggest narrowing to a specific directory or file set.

### Step 2 — Load Project Rules

1. Look for project rules in this order: `AGENTS.md`, `.github/copilot-instructions.md`, `CLAUDE.md`, `.cursorrules`.
2. Use the first one found. Extract enforceable conventions (naming, structure, patterns, forbidden practices).
3. If none are found, continue with language-idiomatic conventions and standard linter sensibilities. State in the report: "No project rules file found — using general best practices."

### Step 3 — Spawn Three Review Sub-Agents in Parallel

Read every target file's full content. Then spawn exactly three sub-agents in parallel, giving each one the same payload described below.

#### Shared Input (send to every sub-agent)

Provide each sub-agent with:
- The full content of every target file (or the diff if files are very large).
- The project rules extracted in Step 2 (or "none found — use general best practices").
- The user's focus text, if any.
- The instruction: "Return findings as a markdown list. Each finding must follow the format below. Return an empty list if you find nothing."

#### Required Finding Format (same for all three agents)

Each finding must include:
```
- **file**: `path/to/file`
  **line**: L or L-L range
  **issue**: one-sentence description of the problem
  **suggestion**: concrete code change or refactor to apply
  **confidence**: high | medium | low
  **risk**: safe (behavior-preserving) | caution (could change behavior) | risky (changes public API or semantics)
```

#### Agent-Specific Instructions

**Code Reuse Agent**
Review for duplication and reuse opportunities:
- Duplicated or near-duplicated logic across files or within the same file.
- Repeated literal values (strings, numbers, config) that should be constants.
- Logic that should be extracted into shared helpers, utilities, or base classes.
- Copy-pasted patterns that differ only in parameter values.
Do NOT flag intentional repetition where abstraction would hurt clarity (e.g. test fixtures).

**Code Quality Agent**
Review for readability, naming, structure, and maintainability:
- Poor or misleading variable/function/class names.
- Functions or methods that are too long or do too many things.
- Missing or misleading comments; commented-out dead code.
- Inconsistency with project rules from Step 2.
- Overly clever code that sacrifices readability.
- Structural issues (deep nesting, god objects, feature envy).

**Efficiency Agent**
Review for avoidable CPU, memory, and I/O inefficiencies:
- Unnecessary allocations, copies, or conversions in loops.
- N+1 queries or repeated I/O that could be batched.
- Algorithmic inefficiencies (quadratic where linear is possible).
- Unused imports, dead code paths, or redundant computations.
- Opportunities to use lazy evaluation, caching, or streaming.
Do NOT micro-optimize code that is not on a hot path. Focus on changes that meaningfully impact performance.

### Step 4 — Aggregate and Resolve Conflicts

Collect findings from all three agents, then:

1. **Deduplicate**: If two or more agents flag the same line/symbol, merge into a single finding. Keep the most specific suggestion.
2. **Detect conflicts**: If agents suggest contradictory changes to the same code (e.g., one says "extract helper" and another says "inline this"), apply the safer/smaller change and list the conflict in LEFT UNCHANGED with both suggestions for the user to decide.
3. **Filter by confidence and risk**:
   - Apply `high` confidence + `safe` risk fixes automatically.
   - Apply `medium` confidence + `safe` risk fixes automatically but flag them in the report.
   - List `low` confidence or `caution`/`risky` findings in LEFT UNCHANGED — do not auto-apply.
4. **Respect focus**: If the user provided focus text, prioritize findings that match that concern. Still report other findings but apply focus-matching fixes first.

### Step 5 — Apply Fixes

- Edit target files to implement the selected improvements.
- Prefer small, targeted refactors over broad rewrites.
- Do NOT change external behavior, public APIs, function signatures, or module exports unless the user explicitly requested it.
- Do NOT remove or rewrite tests. If test code has findings, list them in LEFT UNCHANGED.
- After all edits, all changes remain unstaged so the user can review with `git diff`.

### Step 6 — Completion Report

Return a report using the format below.

## Output Format

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
- [ ] `file:line` — what changed — why — confidence

**LEFT UNCHANGED**
- [ ] `file:line` — reason not auto-fixed (low confidence | risk | conflict | test code)

**SUMMARY**
- Total fixes applied: N
- Remaining manual items: N
- Confidence: High | Medium | Low
- Rollback: `git checkout -- <files>` to undo all changes

If no meaningful improvements are found, respond with: `No material simplifications found in the selected changes.`
