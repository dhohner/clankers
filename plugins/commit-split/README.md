# Commit Split Plugin

Breaks mixed staged changes into clean, logical commits with suggested commit messages.

## What It Does

Claude uses this slash command when one staging area contains multiple concerns. Organizes staged changes with:

- Logical commit groupings based on the files involved
- Separation of features, refactors, tests, and tooling changes when possible
- Suggested commit messages for each proposed commit
- Optional `git add` guidance to make the split easier to execute

## Usage

```text
"/commit-split"
"Stage a mixed feature and refactor, then run /commit-split"
"Use /commit-split before opening a PR from a messy staging area"
```

Claude will review the staged changes and propose a clean multi-commit breakdown.

## Learn More

See [the command definition](./commit-split.md) for the grouping rules and output format.

## Authors

[dhohner](https://github.com/dhohner)
