# Agent Hooks

Agent Hooks is a Claude-format `PreToolUse` hook that blocks agent commands which dump the user environment or read common local credentials.
The hook runs with `bash` and `jq` alone, so it works without Node.js or a build step.

## Install

### Claude Code

Add the marketplace and install the plugin:

```bash
/plugin marketplace add dhohner/clankers
/plugin install agent-hooks@dhohner-clankers
```

The hook requires `jq`.

Agent Hooks supports macOS and Linux, not Windows.

## How it works

The hook reads the tool call from stdin, and exits `0` for any tool other than `Bash`, `run_in_terminal`, or `runTerminalCommand`.
For a terminal command it prints `{"continue":true}` and exits `0` when the command is harmless.
It writes `Command blocked by security policy.` to stderr and exits `2` when the command matches a rule, so the host rejects the call.

### Blocked commands

- Environment dumps such as `printenv`, standalone `env`, `export -p`, `declare -x`, and standalone `set`.
- Dotenv files, SSH private keys, non-certificate `.pem` files, shell history, and credential helpers.
- AWS, gcloud, Azure, Kubernetes, Docker, and npm credential stores.
- Token commands such as `gh auth token`, `gcloud auth print-access-token`, and selected password-manager reads.

The exact command `env | grep '^PI_' | sort` remains available for Pi runtime metadata.
Do not store credentials in custom `PI_*` variables because this command prints every matching value.

The `.pem` rule allows public certificate names such as `cert.pem`, `fullchain.pem`, `chain.pem`, `ca.pem`, `cacert.pem`, and names ending in `-cert.pem`.
Files under `.ssh/` remain blocked, and the certificate-name match is case-sensitive.

### Relation to security-guard

The same rules exist as JavaScript regular expressions in the [`security-guard`](../security-guard) Pi extension.
This hook reimplements them as POSIX extended regular expressions in [`block-fups.sh`](./scripts/block-fups.sh) because it cannot load the TypeScript.
POSIX ERE has no negative lookahead, so the `.pem` exemption is a shell function rather than one pattern.
Each plugin tests its rules against its own copy of `test/fixtures/blocked-text-cases.json`, so apply a rule change to both plugins and both fixtures.

## Development

Run the shell tests:

```bash
pnpm test
```

The tests use [bats](https://github.com/bats-core/bats-core) 1.5.0 or later through `pnpm dlx` and need `jq`.

## Author

[dhohner](https://github.com/dhohner)
