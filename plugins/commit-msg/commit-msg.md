---
description: Generate a commit message for staged changes.
argument-hint: "[extra guidance or ticket number]"
---

# Commit Message

Analyze the staged changes and generate a commit message following this exact template:

```text
feat|chore|fix|refactor: ${commit message}

Changes done

Issue: ${Jira Ticket Number}
```

## Instructions

1. Analyze the staged changes to understand what was modified.
2. Determine the commit type:
   - `feat`: new feature or functionality
   - `fix`: bug fix
   - `chore`: maintenance, dependencies, configs, docs
   - `refactor`: code restructuring without changing behavior
3. Write a concise subject line:
   - 50-72 characters when practical
   - lowercase start
   - no trailing period
   - imperative mood
4. Generate a concise body that focuses on what changed and why.
5. Use the provided arguments as extra guidance when they help.
6. Leave `Issue: ${Jira Ticket Number}` as a placeholder unless the ticket is explicitly provided or can be inferred with high confidence from the branch name.

## Output Format

Return only the commit message in a fenced code block, ready to paste.