# Block Package Managers Plugin

Prevents `npm` and `npx` usage during agent terminal work and redirects commands toward `pnpm`.

This plugin supports Claude-format hooks and Pi extensions. It is intentionally scoped to Unix-like environments and direct terminal commands handled through Bash-compatible hosts.

## What It Does

This hook runs on the agent `PreToolUse` lifecycle event in Claude-format hosts. The Pi extension intercepts Pi `bash` tool calls. Both enforce a package-manager policy with:

- Blocking `npm` commands before they execute and suggesting the closest `pnpm` equivalent
- Blocking `npx` commands and suggesting `pnpm` alternatives
- Choosing between `pnpm exec` and `pnpm dlx` based on the command
- Skipping quietly when `jq` is not installed
- Keeping package-manager usage consistent across sessions

## Scope

- Targets macOS and Linux only; Windows is intentionally not supported
- Intercepts Bash or terminal tool calls before they execute in Claude-format hosts
- Intercepts Pi `bash` tool calls before they execute and Pi user shell commands (`!` / `!!`)
- Only rewrites direct commands that start with `npm` or `npx`
- Requires `jq` to inspect hook input in Claude-format hosts

## Usage

```text
"Run npm install"
"Run npx prettier --write ."
"Use npx create-vite@latest demo"
```

The agent will stop the command and suggest the equivalent `pnpm`, `pnpm exec`, or `pnpm dlx` invocation.

## Pi Usage

Install the plugin as a Pi package from a local checkout:

```bash
pi install ./plugins/block-package-managers
```

For project-local team use, install it into `.pi/settings.json`:

```bash
pi install -l ./plugins/block-package-managers
```

For one-off testing without installing:

```bash
pi -e ./plugins/block-package-managers/extensions/block-package-managers.ts
```

## Learn More

See [the hook script](./scripts/block-package-managers.sh), [hook registration](./hooks/hooks.json), [Pi extension](./extensions/block-package-managers.ts), and [Pi package manifest](./package.json) for implementation details.

## Authors

[dhohner](https://github.com/dhohner)
