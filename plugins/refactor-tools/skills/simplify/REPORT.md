# Completion Report

Use the standard template when fixes or manual items exist.
Use the no-change template only when no meaningful finding exists.
Replace every placeholder with an observed value.

## Standard template

```md
**RESULT**

- Fixes applied: N
- Manual items: N
- Confidence: High | Medium | Low

**SCOPE**

- Source: staged changes | last commit | user-specified scope
- Edit scope: edit regions | widened for correctness | whole-file by user request
- Files processed: N
- Files skipped: N (reasons)
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

Omit `APPLIED FIXES` or `LEFT UNCHANGED` when that section has no items.
List each validation command separately.
Never claim validation from code inspection alone.

## No-change template

```md
**RESULT**

No material simplifications found.

**SCOPE**

- Source: staged changes | last commit | user-specified scope
- Edit scope: edit regions | whole-file by user request
- Files processed: N
- Files skipped: N (reasons)
- Project rules: `paths` | none - general best practices applied
- Focus: `<user focus text>` | none
```
