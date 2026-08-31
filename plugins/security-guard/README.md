# Security Guard

Security Guard is a Pi extension that blocks agent commands which dump the user environment or read common local credentials.
It also requires approval for destructive shell commands.
The Claude-format hook with the same environment and credential rules is the [`agent-hooks`](../agent-hooks) plugin.

## Install

Pi requires version 0.84.0 or later.
Install from a local checkout:

```bash
pi install ./plugins/security-guard
```

Use `-l` for a project-local install in `.pi/settings.json`:

```bash
pi install -l ./plugins/security-guard
```

Run the extension once without installing it:

```bash
pi -e ./plugins/security-guard/index.ts
```

Security Guard supports macOS and Linux, not Windows.

## How it works

![Security Guard decision flow: the Pi extension checks Bash and Read calls, analyzes destructive commands, proves eligible temporary and build-output paths, requests a model assessment, and asks for approval. The agent-hooks Claude hook checks Bash calls for blocked environment and credential access only.](./assets/decision-flow.svg)

The extension checks tool calls before execution and returns a blocked tool call.

### Environment and credentials

Security Guard blocks:

- Environment dumps such as `printenv`, standalone `env`, `export -p`, `declare -x`, and standalone `set`.
- Dotenv files, SSH private keys, non-certificate `.pem` files, shell history, and credential helpers.
- AWS, gcloud, Azure, Kubernetes, Docker, and npm credential stores.
- Token commands such as `gh auth token`, `gcloud auth print-access-token`, and selected password-manager reads.

The exact command `env | grep '^PI_' | sort` remains available for Pi runtime metadata.
Do not store credentials in custom `PI_*` variables because this command prints every matching value.

The `.pem` rule allows public certificate names such as `cert.pem`, `fullchain.pem`, `chain.pem`, `ca.pem`, `cacert.pem`, and names ending in `-cert.pem`.
Files under `.ssh/` remain blocked, and the certificate-name match is case-sensitive.

### Destructive commands in Pi

The Pi extension asks for approval before commands that can discard work:

- File removal or overwrite through `rm`, `rmdir`, `unlink`, `shred`, `truncate`, `dd`, or `mkfs`.
- Risky `mv`, `chmod`, or `chown` calls.
- Destructive Git operations such as `git reset --hard`, non-dry-run `git clean`, forced or deleting pushes, and working-tree overwrites.

The analyzer follows wrappers such as `sudo`, `env`, `xargs`, `find -exec`, and `bash -c`.
It also inspects command substitutions, process substitutions, and unquoted here-document expansions.
Unknown syntax, unresolved commands, and unproven operands require approval.

Non-interactive Pi sessions block commands that require approval.
The exact analysis rules are in [`analyze-command.ts`](./src/policy/command-analysis/analyze-command.ts) and [`classifiers.ts`](./src/policy/command-analysis/classifiers.ts).
Each command's classifier sits beside that table in [`src/policy/command-analysis/commands/`](./src/policy/command-analysis/commands/), and what its words mean to the parser and the proof is in [`registry.ts`](./src/commands/registry.ts).

### Safety assessment in Pi

Before showing an approval dialog, Pi asks `gpt-5.6-luna` at `high` reasoning effort for an advisory verdict, intent, and reason.
The user still decides whether the command runs.

The request contains only a fixed system instruction, the exact command, and the working directory.
Security Guard tries the direct OpenAI API, OpenAI Codex subscription, and GitHub Copilot providers in that order.
It blocks the command without a dialog when no provider is authenticated or the assessment fails.

### Automatic exceptions in Pi

Security Guard skips assessment and approval when it can prove either exception:

- Temporary paths are inside `/tmp`, `/private/tmp`, or the macOS per-user temporary directory.
- `rm` or `rmdir` targets are inside an existing `node_modules`, `dist`, `build`, `target`, `.next`, `out`, or `coverage` directory within the working directory.

The temporary-path exception applies to `rm`, `rmdir`, `unlink`, `truncate`, `mv`, `chmod`, and `chown`.
It checks command resolution, path operands, redirections, links, variables, and `mktemp` results.

The build-output exception applies only to `rm` and `rmdir`.
Calls that mix temporary and build-output targets qualify for neither exception.
Credential rules always apply.

The full proof rules are in [`decide-tool-call.ts`](./src/application/decide-tool-call.ts), [`regenerable-directory.ts`](./src/infrastructure/node/regenerable-directory.ts), and [`src/proof/`](./src/proof/).

## Limits

- Filesystem checks happen before execution and do not prevent another local process from changing a checked path.
- Here-documents sent to remote or container commands such as `ssh` and `docker exec` are treated as data, except for substitutions expanded by the local shell.
- Pi settings `shellCommandPrefix` and `shellPath` can redefine commands after analysis, so do not use the automatic exceptions in sessions that set either option.

## Development

Run all package checks:

```bash
pnpm run check
```

The command runs lint, format checks, unit tests, and TypeScript checks.
Use `pnpm run lint:fix` and `pnpm run format` only when you intend to rewrite files, then review the diff.

## Author

[dhohner](https://github.com/dhohner)
