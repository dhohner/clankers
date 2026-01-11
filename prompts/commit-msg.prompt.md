---
agent: agent
name: commit-msg
description: Generate commit message for staged changes
---

Analyze my staged changes and generate a commit message following this exact template:

```
feat|chore|fix|refactor: ${commit message}

Changes done

Issue: ${Jira Ticket Number}
```

**Instructions:**

1. **Analyze the staged changes** to understand what was modified
2. **Determine the commit type:**

   - `feat`: New feature or functionality
   - `fix`: Bug fix
   - `chore`: Maintenance, dependencies, configs, docs
   - `refactor`: Code restructuring without changing behavior

3. **Write a concise commit message** (50-72 chars):

   - Start with lowercase
   - No period at the end
   - Imperative mood ("add" not "added")
   - Be specific and meaningful

4. **Generate the body** with:

   - Bullet points of key changes (if multiple changes)
   - OR a brief paragraph (if single focused change)
   - Focus on WHAT and WHY, not HOW
   - Keep it concise but informative

5. **Issue number:**
   - Leave as placeholder `${Jira Ticket Number}` if you don't know
   - OR ask me for the ticket number
   - OR infer from branch name if it follows pattern like `feature/PROJ-123`

**Output Format:**
Provide the commit message in a code block ready to copy-paste.

**Example Output:**

```
feat: add user authentication with JWT tokens


- Implemented login/logout endpoints
- Added JWT token generation and validation
- Created auth middleware for protected routes
- Updated user model with password hashing

Issue: ${Jira Ticket Number}
```
