# Lint and Format Plugin

Runs formatting and linting automatically after code edits when the workspace exposes matching `pnpm` scripts.

## What It Does

Claude automatically uses this hook after code-changing tools. Keeps edited projects tidy by:

- Detecting when a code-editing tool has modified the workspace
- Running `pnpm format` when a `format` script exists
- Running `pnpm lint` when a `lint` script exists
- Returning actionable error context when formatting or linting fails

## Usage

```text
"Refactor this React component"
"Add a loading state to the checkout form"
"Rename this API route and update the tests"
```

Claude will run the available `pnpm format` and `pnpm lint` scripts after making code changes in a compatible workspace.

## Learn More

See [the hook script](./scripts/lint-and-format.sh) and [hook registration](./hooks/hooks.json) for the exact behavior.

## Authors

[dhohner](https://github.com/dhohner)
