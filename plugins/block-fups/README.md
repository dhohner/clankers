# Block Fups Plugin

Prevents agent terminal work from printing the current user environment.

This plugin is intentionally scoped to Unix-like environments and direct terminal commands handled through Bash-compatible Claude-format hosts.

## What It Does

This hook runs on the agent `PreToolUse` lifecycle event and blocks likely environment-dump commands before they execute:

- `printenv`
- standalone `env`
- `export` / `export -p`
- `declare -x`
- standalone `set`

The hook writes a denial reason to stderr and exits with code `2`, which is the shared blocking path for Claude-format hooks and is also supported by VS Code agent hooks. The denial reason explicitly tells the agent not to suggest workarounds, alternate commands, or indirect ways to print the current user environment.

## Scope

- Targets macOS and Linux only; Windows is intentionally not supported
- Intercepts Bash or terminal tool calls before they execute
- Blocks direct commands and simple nested shell invocations containing env-dump commands
- Requires `jq` to inspect hook input

## Usage

```text
"Run printenv"
"Show env | sort"
"Use bash -lc 'printenv'"
```

The agent will stop the command before it can print environment variables.

## Learn More

See [the hook script](./scripts/block-fups.sh) and [hook registration](./hooks/hooks.json) for implementation details.

## Authors

[dhohner](https://github.com/dhohner)
