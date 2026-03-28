# Block Package Managers Plugin

Prevents `npm` and `npx` usage during agent terminal work and redirects commands toward `pnpm`.

## What It Does

Claude automatically uses this hook before terminal commands run. Enforces a package-manager policy with:

- Blocking `npm` commands before they execute
- Blocking `npx` commands and suggesting `pnpm` alternatives
- Choosing between `pnpm exec` and `pnpm dlx` based on the command
- Keeping package-manager usage consistent across sessions

## Usage

```text
"Run npm install"
"Run npx prettier --write ."
"Use npx create-vite@latest demo"
```

Claude will stop the command and suggest the equivalent `pnpm`, `pnpm exec`, or `pnpm dlx` invocation.

## Learn More

See [the hook script](./scripts/block-package-managers.sh) and [hook registration](./hooks/hooks.json) for implementation details.

## Authors

[dhohner](https://github.com/dhohner)
