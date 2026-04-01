---
name: split
description: Suggest how to split staged changes into multiple logical commits.
disable-model-invocation: true
allowed-tools: Bash, Read, Grep, Glob
---

# Commit Split

Analyze the staged changes and suggest how to split them into multiple logical commits.

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
