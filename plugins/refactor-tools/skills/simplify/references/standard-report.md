# Standard Report

```md
**RESULT**

- Fixes applied: N
- Findings left unchanged: N
- Confidence: High | Medium | Low

**SCOPE**

- Source: staged changes | last commit | user-specified scope
- Edit scope: edit regions | widened for correctness | whole-file by user request
- Files processed: N
- Files skipped: 0 | N (`path` - reason; ...)
- Project rules: `paths` | none - general best practices applied
- Focus: `<user focus text>` | none
- Baseline changes preserved: yes | no (details)

**AGENT FINDINGS**

- Code Reuse: N findings (N high, N medium, N low)
- Code Quality: N findings (N high, N medium, N low)
- Efficiency: N findings (N high, N medium, N low)

**APPLIED FIXES**

- `file:line` - change - reason - confidence

**LEFT UNCHANGED**

- `file:line` - reason (confidence | risk | conflict | scope | validation)

**VALIDATION**

- `command` - outcome and covered behavior
- Untested: behavior | none

**REVERSAL**

- Reverse only the applied hunks listed above and preserve baseline changes.
```

Omit empty `APPLIED FIXES` and `LEFT UNCHANGED` sections.
List validation commands separately.
Base validation claims on observed command results.
