# Block Package Managers Plugin

Prevents `npm` and `npx` usage during agent terminal work and redirects commands toward `pnpm`.

This plugin is intentionally scoped to Unix-like environments and direct terminal commands handled through Bash-compatible Claude-format hosts.

## What It Does

This hook runs on the agent `PreToolUse` lifecycle event in Claude-format hosts and enforces a package-manager policy with:

- Blocking `npm` commands before they execute
- Blocking `npx` commands and suggesting `pnpm` alternatives
- Choosing between `pnpm exec` and `pnpm dlx` based on the command
- Skipping quietly when `jq` is not installed
- Keeping package-manager usage consistent across sessions

## Scope

- Targets macOS and Linux only; Windows is intentionally not supported
- Intercepts Bash or terminal tool calls before they execute
- Only rewrites direct commands that start with `npm` or `npx`
- Requires `jq` to inspect hook input

## Usage

```text
"Run npm install"
"Run npx prettier --write ."
"Use npx create-vite@latest demo"
```

The agent will stop the command and suggest the equivalent `pnpm`, `pnpm exec`, or `pnpm dlx` invocation.

## Learn More

See [the hook script](./scripts/block-package-managers.sh) and [hook registration](./hooks/hooks.json) for implementation details.

## Authors

[dhohner](https://github.com/dhohner)
