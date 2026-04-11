# Lint and Format Plugin

Runs formatting and linting automatically when the agent finishes a coding turn and the workspace exposes matching `pnpm` scripts.

This plugin is intentionally scoped to Unix-like environments and JavaScript/TypeScript workspaces with a root-level `package.json`.

## What It Does

This hook runs on the agent `Stop` lifecycle event in Claude-format hosts and keeps edited projects tidy by:

- Waiting until the agent is done coding before running checks
- Exiting early when `git status` shows no changed `js`, `jsx`, `ts`, or `tsx` files
- Running `pnpm format` when a `format` script exists
- Running `pnpm lint` when a `lint` script exists
- Skipping with a warning when `jq`, `git`, or `pnpm` is not installed
- Returning a final warning message when formatting or linting fails

## Scope

- Targets macOS and Linux only; Windows is intentionally not supported
- Looks for `package.json` in the workspace root only
- Only reacts to changed `js`, `jsx`, `ts`, and `tsx` files
- Requires `jq`, `git`, and `pnpm` to be installed

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
