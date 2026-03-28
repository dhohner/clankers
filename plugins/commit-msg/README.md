# Commit Message Plugin

Generates structured commit messages for staged changes using the repository's preferred format.

## What It Does

Claude uses this slash command to turn staged diffs into a ready-to-paste commit message. Creates commit text with:

- The correct `feat`, `fix`, `chore`, or `refactor` prefix
- A concise subject line based on the staged changes
- A short body describing what changed and why
- A Jira issue placeholder unless a ticket is provided or safely inferred

## Usage

```text
"/commit-msg"
"/commit-msg AUTH-789"
"/commit-msg focus on the schema migration"
```

Claude will analyze the staged changes and return a commit message in the expected template.

## Learn More

See [the command definition](./commit-msg.md) for the exact prompt and output rules.

## Authors

[dhohner](https://github.com/dhohner)
