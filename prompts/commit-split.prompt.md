---
agent: agent
name: commit-split
description: Suggest how to split staged changes into multiple commits
---

Analyze my staged changes and suggest how to split them into multiple logical commits.

**For each suggested commit:**

1. **Files to include** in this commit
2. **Commit message** following our template:

```
   feat|chore|fix|refactor: ${commit message}

   #body
   Changes done

   Issue: ${Jira Ticket Number}
```

**Grouping Logic:**

- Each commit should be a single logical change
- Related files go together
- Tests with the code they test
- Separate refactoring from features
- Config/tooling changes separate from code

**Output Format:**

**Commit 1:**
Files: [list]

```
[commit message]
```

**Commit 2:**
Files: [list]

```
[commit message]
```

Provide git commands to stage each group if helpful.
