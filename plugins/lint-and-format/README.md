# Lint and Format Plugin

Runs formatting and linting automatically when the agent finishes a coding turn and the workspace exposes matching `pnpm` scripts.

## What It Does

This hook runs on VS Code's `Stop` lifecycle event and keeps edited projects tidy by:

- Waiting until the agent is done coding before running checks
- Exiting early when `git status` shows no changed `js`, `jsx`, `ts`, or `tsx` files
- Running `pnpm format` when a `format` script exists
- Running `pnpm lint` when a `lint` script exists
- Returning a final warning message when formatting or linting fails

## Usage

```text
"Refactor this React component"
"Add a loading state to the checkout form"
"Rename this API route and update the tests"
```

The agent will run the available `pnpm format` and `pnpm lint` scripts once the turn is ending, instead of after each intermediate edit.

## Learn More

See [the hook script](./scripts/lint-and-format.sh) and [hook registration](./hooks/hooks.json) for the exact behavior.

## Authors

[dhohner](https://github.com/dhohner)
