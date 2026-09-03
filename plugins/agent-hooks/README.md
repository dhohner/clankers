# Agent Hooks

Agent Hooks is a Claude-format `PreToolUse` hook.
It denies environment and credential dumps, then asks for approval before tools read common credential files or sweep the home directory.
It requires only `bash`, `jq`, `sed`, and `awk`.

## Install

### Claude Code

Add the marketplace and install the plugin:

```bash
/plugin marketplace add dhohner/clankers
/plugin install agent-hooks@dhohner-clankers
```

Install `jq` before using the hook.
Without `jq`, the hook warns on stderr and cannot inspect the call.

Agent Hooks supports macOS and Linux, including the bash 3.2 that ships with macOS.

## How it works

The hook reads one tool call from stdin.
It returns one of these decisions:

- Deny environment and credential dump commands with exit code `2` and `Command blocked by security policy.` on stderr.
- Ask Claude Code for approval when a tool call reads a credential file or searches from the home directory.
- Continue other inspected calls with exit code `0` and no output, so the normal permission flow applies.

### Inspected tools

- The hook inspects terminal commands from `Bash`, `run_in_terminal`, and `runTerminalCommand`.
- The hook inspects file paths from `Read`.
- The hook inspects paths and glob filters from `Grep`.
- The hook inspects patterns and paths from `Glob`.

The hook does not inspect `Grep` content patterns, so searches for source strings such as `process.env` continue.
The bundled `hooks/hooks.json` registers two matcher groups that select the mode.
Terminal tools run `credential-guard.sh command` and file tools run `credential-guard.sh path`.
Custom hook configurations must add each tool name to the matching group and pass its mode argument.

### Command matching

The hook splits terminal commands at `;`, `|`, `&&`, `||`, `&`, newlines, parentheses, and command substitutions.
The hook matches the first word of each resulting command.
It first removes leading assignments and wrappers such as `sudo`, `command`, `exec`, `time`, `nice`, `xargs`, and `env VAR=value`.
The hook inspects strings passed to `bash -c`, `sh -c`, or `eval` as commands.

Quoted or backslash-escaped separators do not split a command.
The hook reads `git commit -m "fix; env"`, `rg "pat|token" src/`, and `find . -exec cat {} \;` as written.
Command substitutions inside double quotes still run, so the hook denies `echo "$(env)"`.

A heredoc fed to `cat` or `tee` is file data and its body is skipped.
A heredoc fed to `python` or `node` is checked with the interpreter rules.
Every other heredoc body is checked as commands.

### Denied commands

- The hook denies environment dumps such as `printenv`, standalone `env`, `export`, `export -p`, `declare -x`, `declare -p`, and standalone `set`.
- The hook denies interpreter one-liners that print the whole environment.
  - Examples include `node -e 'console.log(process.env)'`, `node -pe process.env`, `deno eval 'Deno.env.toObject()'`, and `python3 -c 'import os;print(os.environ)'`.
  - Matching covers attached or clustered options such as `-cimport`, optional chaining such as `process?.env`, and Python f-strings such as `f"{os.environ}"`.
  - Single-variable reads such as `process.env.PATH`, `process.env?.HOME`, and `os.environ.get("HOME")` continue.
  - String literals such as `"see process.env"` also continue.
- The hook denies token commands such as `gh auth token`, `gh auth status --show-token`, `gcloud auth print-access-token`, and `security find-generic-password`.
  - The rule also covers selected password-manager reads and commands with leading global options such as `--project x`.
  - The hook accounts for global options that take values in `gcloud`, `aws`, `az`, `gh`, `op`, and `npm`.
  - A value named like a subcommand cannot hide the real subcommand.

The exact command `env | grep '^PI_' | sort` remains available for Pi runtime metadata.
Do not store credentials in custom `PI_*` variables because this command prints every matching value.

### Credential files that trigger a prompt

- The hook prompts for dotenv files, SSH private keys, non-certificate `.pem` files, shell history, shell rc files, and credential helpers.
- The hook prompts for credential stores from AWS, gcloud, Azure, Kubernetes, Docker, npm, PyPI, and Terraform.
- The hook also prompts for the gh CLI `hosts.yml` and `/proc/<pid>/environ`.

The rules match relative and absolute paths, including `~` and `$HOME` prefixes.
The `.pem` rule allows `cert.pem`, `fullchain.pem`, `chain.pem`, `ca.pem`, `cacert.pem`, and names ending in `-cert.pem`.
The exemption is case-sensitive and does not apply under `.ssh/`.

The verb decides whether a path reference is a read:

- Metadata verbs such as `ls`, `test`, `stat`, `rm`, `chmod`, and `find` without `-exec` never prompt.
- Key generators such as `openssl req`, `openssl genrsa`, `mkcert`, and `ssh-keygen` do not prompt for files named by output options.
  - This exemption lets test fixtures create files such as `key.pem`.
  - Keys passed to other options prompt, including `openssl req -key key.pem` and `ssh-keygen -y -f key.pem`.
- Search verbs such as `grep` and `rg` exclude their pattern argument when classifying operands.
  - The pattern can be positional or follow `-e` or `--regexp`.
  - The command `grep -rn "key.pem" test/` continues, while `grep "" key.pem` prompts.
  - Pattern files are read, so `grep -f .env src/` prompts.
- Every other verb prompts when a credential path appears as an argument or option value.
  - Examples include `cat`, `cp`, `openssl rsa`, and scripts that accept `--file=key.pem` or `-fkey.pem`.
- The `Read` tool always prompts for a credential file.

### Credential sweeps that trigger a prompt

A search rooted at the home directory prompts, because that is where an agent looks for a token after `env` is denied.
The rule covers `grep -r`, `rg`, `ag`, `find`, `fd`, and the `Grep` and `Glob` tools.
It applies when the root is `~`, `$HOME`, `/root`, `/Users/<name>`, `/home/<name>`, or a direct child dot directory.
`find` and `fd` with an execution option such as `-exec` or `-x` also prompt for credential files they name.
Searches inside a project directory continue, including `Glob **/*.pem`.

### Threat model

Quoting tricks such as `cat .e"nv"`, variable indirection, and encoding can bypass the text patterns.
A script that reads a named key through an unlisted verb prompts.
A script that reads a key without naming it on the command line does not prompt.
The deny message tells cooperative agents not to bypass a match.
Use OS-level sandboxing or permission deny rules to enforce access controls.

## Development

The entrypoint `scripts/credential-guard.sh` reads the tool call, sources the libraries, and prints the decision.
The `scripts/lib/shell-text.sh` library splits a command into simple commands.
The `scripts/lib/deny-rules.sh` library contains the deny rules.
The `scripts/lib/path-rules.sh` library classifies verbs and matches operands against credential paths.

Run the shell tests:

```bash
pnpm test
```

The tests use [bats](https://github.com/bats-core/bats-core) 1.5.0 or later through `pnpm dlx` and need `jq`.
The fixtures in `test/fixtures` pin the expected decision, `deny`, `ask`, or `pass`, for each command and tool call.

## Author

[dhohner](https://github.com/dhohner)
