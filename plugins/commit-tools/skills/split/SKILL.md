---
name: split
description: Suggest how to split staged changes into multiple logical commits. Optional args: ticket, hint, `caveman`, or `ultra`.
argument-hint: "[hint | ticket | caveman | ultra]"
disable-model-invocation: true
allowed-tools: Bash, Read, Grep, Glob
---

# Commit Split

Analyze the staged changes and suggest how to split them into multiple logical commits.

## Arguments

The user invoked this skill with:

`$ARGUMENTS`

Style flags:

- `caveman`
- `ultra`

## For Each Suggested Commit

1. List the files to include.
2. Provide a commit message using this template:

```text
feat|chore|fix|refactor: ${commit message}

Changes done

Issue: ${Jira Ticket Number}
```

## Grouping Rules

- Each commit should represent one logical change.
- Keep tests with the code they validate.
- Separate refactors from features when possible.
- Keep tooling or configuration changes separate from product behavior changes.
- Use the provided arguments as extra guidance when they help, but treat `caveman` and `ultra` as style controls rather than user-facing content.
- Default to normal professional commit style unless one of the caveman style flags is explicitly present in `$ARGUMENTS`.
- If `caveman` is present, keep each suggested commit message terse and direct.
- If `ultra` is present, use compressed caveman wording for each suggested commit message while keeping the result clear and still following the required template.

## Output Format

Use this structure:

```text
Commit 1:
Files: [list]
Commit message:
[full commit message]

Commit 2:
Files: [list]
Commit message:
[full commit message]
```

If useful, include `git add` commands for each group.
