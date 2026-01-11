---
agent: agent
name: agents-check
description: Strict compliance check against AGENTS.md
---

Perform a strict compliance check of the specified code against @AGENTS.md guidelines.

**Instructions:**

1. Read @AGENTS.md thoroughly
2. Extract all enforceable rules and conventions
3. Check code changes against each rule
4. Report ONLY violations (not what's correct)

**Output Format:**

**BLOCKING ISSUES** (must fix before merge):

- [ ] [Rule from AGENTS.md] → [File:line] → [What's wrong]

**WARNINGS** (should fix):

- [ ] [Rule from AGENTS.md] → [File:line] → [What's wrong]

**RECOMMENDATIONS** (optional improvements):

- [ ] [Suggestion] → [File:line] → [Why it's better]

**SUMMARY:**

- Blocking: X issues
- Warnings: Y issues
- Status: ✅ PASS / ❌ FAIL

Each item should be actionable with:

- Exact guideline reference from AGENTS.md
- Specific file and line number
- Clear description of the violation
- How to fix it

If no AGENTS.md exists, respond: "⚠️ No AGENTS.md found. Create one to define project guidelines."
