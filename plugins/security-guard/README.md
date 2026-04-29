# Security Guard Plugin

Prevents agent tool work from printing the current user environment or reading common local credentials.

This plugin supports Claude-format hooks and Pi extensions. The Claude-format hook is intentionally scoped to Unix-like environments and direct terminal commands handled through Bash-compatible hosts. The Pi extension intercepts Pi `bash` and `read` tool calls.

## What It Does

This hook runs on the agent `PreToolUse` lifecycle event and blocks likely environment-dump commands before they execute:

- `printenv`
- standalone `env`
- `export` / `export -p`
- `declare -x`
- standalone `set`

It also blocks direct attempts to read or print common secret material:

- dotenv files such as `.env` and `.env.local`
- SSH private keys and `.pem` key files
- shell history and credential helper files such as `.netrc` and `.git-credentials`
- common cloud and tool credential stores, including AWS, gcloud, Azure, kube, Docker, and npm config files
- token-printing commands such as `gh auth token`, `gcloud auth print-access-token`, `aws configure export-credentials`, `az account get-access-token`, and selected password-manager reads

The Claude-format hook writes a denial reason to stderr and exits with code `2`, which is the shared blocking path for Claude-format hooks and is also supported by VS Code agent hooks. The Pi extension returns a blocked tool call with the same policy message. The denial reason explicitly tells the agent not to suggest workarounds, alternate commands, or indirect ways to print the current user environment or read sensitive credentials.

## Scope

- Targets macOS and Linux only; Windows is intentionally not supported
- Intercepts Bash or terminal tool calls before they execute in Claude-format hosts
- Intercepts `bash` and `read` tool calls before they execute in Pi
- Blocks direct commands and simple nested shell invocations containing env-dump or sensitive credential access commands
- Intentionally favors clear, high-signal secret paths and token commands over broad keyword matching
- Requires `jq` to inspect hook input in Claude-format hosts

## Usage

```text
"Run printenv"
"Show env | sort"
"Use bash -lc 'printenv'"
"cat ~/.aws/credentials"
"gh auth token"
```

The agent will stop the command before it can print environment variables or credential material.

## Pi Usage

Install the plugin as a Pi package from a local checkout:

```bash
pi install ./plugins/security-guard
```

For project-local team use, install it into `.pi/settings.json`:

```bash
pi install -l ./plugins/security-guard
```

For one-off testing without installing:

```bash
pi -e ./plugins/security-guard/extensions/block-fups.ts
```

## Learn More

See [the hook script](./scripts/block-fups.sh), [hook registration](./hooks/hooks.json), [Pi extension](./extensions/block-fups.ts), and [Pi package manifest](./package.json) for implementation details.

## Authors

[dhohner](https://github.com/dhohner)
