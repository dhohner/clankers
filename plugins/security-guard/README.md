# Security Guard Plugin

Prevents agent tool work from printing the current user environment or reading common local credentials.

This plugin supports Claude-format hooks and Pi extensions. The Claude-format hook is intentionally scoped to Unix-like environments and direct terminal commands handled through Bash-compatible hosts. The Pi extension intercepts Pi `bash` and `read` tool calls, and asks for human approval before destructive Pi Bash commands such as `rm`, forced `mv`, and risky permission changes.

## What It Does

This hook runs on the agent `PreToolUse` lifecycle event and blocks likely environment-dump commands before they execute:

- `printenv`
- standalone `env`
- `export` / `export -p`
- `declare -x`
- standalone `set`

The exact `env | grep '^PI_' | sort` pipeline is allowed so agents can inspect Pi's documented runtime and session metadata.
Pi provider credentials use other environment variable names.
The exception rejects extra commands, pipeline stages, redirects, grep options, and broader patterns.
Do not store credentials in custom `PI_*` variables because the allowed pipeline intentionally prints every value in that namespace.

It also blocks direct attempts to read or print common secret material:

- dotenv files such as `.env` and `.env.local`
- SSH private keys and `.pem` key files
- shell history and credential helper files such as `.netrc` and `.git-credentials`
- common cloud and tool credential stores, including AWS, gcloud, Azure, kube, Docker, and npm config files
- token-printing commands such as `gh auth token`, `gcloud auth print-access-token`, `aws configure export-credentials`, `az account get-access-token`, and selected password-manager reads

The Claude-format hook writes a denial reason to stderr and exits with code `2`, which is the shared blocking path for Claude-format hooks and is also supported by VS Code agent hooks. The Pi extension returns a blocked tool call with the same policy message. The denial reason explicitly tells the agent not to suggest workarounds, alternate commands, or indirect ways to print the current user environment or read sensitive credentials.

The Pi extension also requires explicit UI approval before agent-run Bash commands starting `rm`, `truncate`, `dd`, or `mkfs`; risky `mv`, `chmod`, or `chown`; plus destructive Git commands (`git reset --hard`, `git clean -fd`, `git push --force`).
In non-interactive mode, those commands are blocked by default.

A narrow exception skips confirmation once when a direct `rm` targets only directories returned by an earlier successful, standalone `mktemp -d` Bash call.
The extension verifies that each directory remains under a system temporary root, is owned by the current user, and still has the same filesystem identity before allowing removal.
Nested paths, untracked directories, compound commands, and repeated removal attempts still require approval.
Only the most recent 128 created directories stay tracked, so older ones fall back to requiring approval.
The exception is POSIX-only: where process ownership cannot be read, no removal is ever skipped.

## Scope

- Targets macOS and Linux only; Windows is intentionally not supported
- Intercepts Bash or terminal tool calls before they execute in Claude-format hosts
- Intercepts `bash` and `read` tool calls before they execute in Pi
- Requires explicit human approval for destructive Pi Bash commands such as `rm`, `truncate`, `dd`, `mkfs`, risky `mv`/`chmod`/`chown`, and selected destructive Git commands
- Skips one approval for direct removal of unchanged, current-user directories created by a successful standalone `mktemp -d` call under a system temporary root
- Blocks direct commands and simple nested shell invocations containing env-dump or sensitive credential access commands
- Allows only the exact `env | grep '^PI_' | sort` environment pipeline, with harmless whitespace and quote variations
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
pi -e ./plugins/security-guard/index.ts
```

## Learn More

See [the hook script](./scripts/block-fups.sh), [hook registration](./hooks/hooks.json), [Pi extension](./index.ts), and [Pi package manifest](./package.json) for implementation details.

## Authors

[dhohner](https://github.com/dhohner)
