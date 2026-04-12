---
name: message
description: Generate a commit message for staged changes. Optional args: ticket, hint, `caveman`, or `ultra`.
argument-hint: "[hint | ticket | caveman | ultra]"
disable-model-invocation: true
allowed-tools: Bash, Read, Grep, Glob
---

# Commit Message

Analyze the staged changes and generate a `git commit` command that preserves this commit message structure:

- subject: `feat|chore|fix|refactor: ${commit message}`
- body paragraph: concise summary of what changed and why as bullet points

## Arguments

The user invoked this skill with:

`$ARGUMENTS`

Style flags:

- `caveman`
- `ultra`

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
4. Generate a concise body paragraph that focuses on what changed and why.
5. Use the provided arguments as extra guidance when they help, but treat `caveman` and `ultra` as style controls rather than user-facing content.
6. Default to normal professional commit style unless one of the caveman style flags is explicitly present in `$ARGUMENTS`.
7. If `caveman` is present, keep the commit message terse and direct.
8. If `ultra` is present, use compressed caveman wording for the commit subject and body while keeping the result clear and still following the required template.
9. Return a shell-ready `git commit` command using repeated `-m` flags so the message can be pasted directly into a terminal.
10. Escape any double quotes or other shell-sensitive characters when needed so the command is safe to paste in `zsh` or `bash`.

## Output Format

Return only the ready to copy `git commit` command in a formatted code block, with no Markdown fences, labels, or extra commentary.
