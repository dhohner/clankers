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

1. Determine target files using this order:
- If the user specifies files/commit/range, use that exact scope.
- Else use staged changes (`git diff --cached --name-only`).
- Else use files from the latest commit (`git show --name-only --pretty='' HEAD`).

2. Read `@AGENTS.md` and extract enforceable project rules.
- If missing, continue with general best practices and state that AGENTS.md was not found.

3. Spawn exactly three review sub-agents in parallel for the same target files:
- `Code Reuse Agent`: identify duplication, repeated literals/logic, and extract shared helpers.
- `Code Quality Agent`: improve readability, naming, structure, and maintainability; enforce AGENTS.md.
- `Efficiency Agent`: identify avoidable CPU/memory/I/O inefficiencies and simplify hot paths.

4. Aggregate findings from all three agents:
- Merge and deduplicate overlapping findings.
- Prioritize safe, behavior-preserving fixes.
- Respect user focus text when choosing what to fix first.

5. Apply fixes directly:
- Edit files to implement the approved improvements.
- Prefer small, clear refactors over broad rewrites.
- Do not change external behavior or public APIs unless explicitly requested.

6. Return a concise completion report.

## Output Format

**SCOPE**
- Source: staged changes | last commit | user-specified scope
- Files processed: X
- Focus: `<user focus>` | `none`

**AGENT FINDINGS**
- Code Reuse: N findings
- Code Quality: N findings
- Efficiency: N findings

**APPLIED FIXES**
- [ ] file:line -> what changed -> why

**LEFT UNCHANGED**
- [ ] file:line -> reason not auto-fixed (risk, ambiguity, behavior change)

**SUMMARY**
- Total fixes applied: X
- Remaining manual items: Y
- Confidence: High | Medium | Low

If no meaningful improvements are found, respond with: `No material simplifications found in the selected changes.`
