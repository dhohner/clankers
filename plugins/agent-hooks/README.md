# Agent Hooks

Agent Hooks is a Claude-format `PreToolUse` hook.
It denies environment and credential dumps, then asks for approval before tools access common credential files.
It requires only `bash` and `jq`.

## Install

### Claude Code

Add the marketplace and install the plugin:

```bash
/plugin marketplace add dhohner/clankers
/plugin install agent-hooks@dhohner-clankers
```

Install `jq` before using the hook.
Without `jq`, the hook warns on stderr and cannot inspect the call.

Agent Hooks supports macOS and Linux.

## How it works

The hook reads one tool call from stdin.
It returns one of these decisions:

- Deny environment and credential dump commands with exit code `2` and `Command blocked by security policy.` on stderr.
- Ask Claude Code for approval when a tool call references a credential file.
- Continue other inspected calls with exit code `0` and no output, so the normal permission flow applies.

### Inspected tools

- `Bash`, `run_in_terminal`, and `runTerminalCommand` terminal commands.
- `Read` file paths.
- `Grep` paths and glob filters.
- `Glob` patterns and paths.

The hook does not inspect `Grep` content patterns, so searches for source strings such as `process.env` continue.
The bundled `hooks/hooks.json` registers two matcher groups that select the mode.
Terminal tools run `credential-guard.sh command` and file tools run `credential-guard.sh path`.
Custom hook configurations must add each tool name to the matching group and pass its mode argument.

### Denied commands

- Environment dumps such as `printenv`, standalone `env`, `export -p`, `declare -x`, and standalone `set`.
- Interpreter one-liners that print the environment, such as `node -e 'console.log(process.env)'` and `python3 -c 'import os;print(os.environ)'`.
- Token commands such as `gh auth token`, `gh auth status --show-token`, `gcloud auth print-access-token`, and selected password-manager reads.

The exact command `env | grep '^PI_' | sort` remains available for Pi runtime metadata.
Do not store credentials in custom `PI_*` variables because this command prints every matching value.

### Credential files that trigger a prompt

- Dotenv files, SSH private keys, non-certificate `.pem` files, shell history, and credential helpers.
- AWS, gcloud, Azure, Kubernetes, Docker, npm, PyPI, and Terraform credential stores, the gh CLI `hosts.yml`, and `/proc/<pid>/environ`.

The rules match relative and absolute paths, including `~` and `$HOME` prefixes.
The `.pem` rule allows `cert.pem`, `fullchain.pem`, `chain.pem`, `ca.pem`, `cacert.pem`, and names ending in `-cert.pem`.
The exemption is case-sensitive and does not apply under `.ssh/`.

### Threat model

Quoting tricks such as `cat .e"nv"`, variable indirection, and encoding can bypass the text patterns.
The deny message tells cooperative agents not to bypass a match.
Use OS-level sandboxing or permission deny rules to enforce access controls.


## Development

Run the shell tests:

```bash
pnpm test
```

The tests use [bats](https://github.com/bats-core/bats-core) 1.5.0 or later through `pnpm dlx` and need `jq`.

## Author

[dhohner](https://github.com/dhohner)
