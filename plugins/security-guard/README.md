# Security Guard Plugin

Stops agent tool calls from dumping the user environment or reading local credentials, and requires human approval before destructive shell commands.

It ships two integrations for Unix-like hosts:

| Protection | Claude-format hook | Pi extension |
| --- | --- | --- |
| Block environment dumps | yes | yes |
| Block credential reads | yes | yes |
| Approval for destructive Bash commands | no | yes |
| Advisory model safety assessment | no | yes |
| Temporary-directory exception | no | yes |

Both integrations run before the tool call executes and deny with the same policy message.
The Claude-format hook writes the reason to stderr and exits with code `2`; the Pi extension returns a blocked tool call.
The message tells the agent not to look for workarounds.

## Blocked commands

Environment dumps: `printenv`, standalone `env`, `export` / `export -p`, `declare -x`, and standalone `set`.

One exception: both integrations allow the exact pipeline `env | grep '^PI_' | sort` so agents can inspect Pi's documented runtime metadata.
Do not store credentials in custom `PI_*` variables; the allowed pipeline prints every value in that namespace.

Credential reads, both direct file access and token-printing commands:

- dotenv files such as `.env` and `.env.local`
- SSH private keys and `.pem` files
- shell history and credential helpers such as `.netrc` and `.git-credentials`
- cloud and tool credential stores: AWS, gcloud, Azure, kube, Docker, npm
- token commands such as `gh auth token`, `gcloud auth print-access-token`, `aws configure export-credentials`, `az account get-access-token`, and selected password-manager reads

## Destructive command approval (Pi)

The Pi extension requires explicit UI approval before Bash commands that can destroy work:

- removal and overwrite: `rm`, `rmdir`, `unlink`, `shred`, `truncate`, `dd`, `mkfs`
- risky `mv`, `chmod`, and `chown`, including forced moves and modes that add write permission
- Git commands that discard state: `git reset --hard`, non-dry-run `git clean`, forced or deleting `git push`, and working-tree overwrites such as `git rm`, `git restore`, and `git checkout` with a pathspec

The analyzer resolves wrappers (`sudo`, `env`, `xargs`, `nice`, `timeout`, `find -exec`, `eval`, and others) to the command they run, and reads nested `bash -c` scripts as command lists of their own.
Anything it cannot prove safe requires approval: a command word built by expansion, an unknown option that could hide an operand, or unsupported shell syntax.
In non-interactive mode the extension blocks these commands outright instead of prompting.

The exact recognition rules live in [`analyze-command.ts`](./src/policy/command-analysis/analyze-command.ts) and [`command-registry.ts`](./src/policy/command-analysis/command-registry.ts).

## Safety assessment

Before each approval dialog, the extension asks a fixed evaluator model for an advisory assessment and shows its Verdict, Intent, and Reason next to the pending command.
The user decides for every verdict; the assessment never approves or executes anything.

The assessment fails closed.
If the model is unavailable, the request fails, or the response is invalid, the extension blocks the command without a dialog.
Each tool call gets one independent request with no retries across providers, and assessments never enter the Pi session or model context.

Data boundary:

- The evaluator is exactly `gpt-5.6-luna` at `high` reasoning effort, reached through the direct OpenAI API, the OpenAI Codex subscription provider, or GitHub Copilot, in that order of preference.
- Each request contains only a fixed system instruction, the exact command, and the working directory; no session messages, file contents, or history.
- The system instruction tells the evaluator to treat the command and working directory as untrusted data, never as instructions.
- With none of the three provider authentications configured in Pi, the extension blocks matched destructive commands.

## Temporary directory exception

`rm`, `rmdir`, `unlink`, `truncate`, `mv`, `chmod`, and `chown` run without assessment or approval when every path the call writes provably resolves inside a system temporary root: `/tmp`, `/private/tmp`, or the macOS per-user temporary directory.
The proof ignores `TMPDIR`, `TMP`, and `TEMP`, so pointing them at a project directory does not make it removable.
Secret-access rules still apply.

The proof runs per command and fails closed.
It checks every write the call can make: operands, redirection targets, variables assigned earlier in the same call, and `$(mktemp -d)` results.
It also verifies how each command word resolves through `PATH`, that symlinks and hard links do not lead outside the root, and that no wrapper, `set` option, or environment variable can change what runs.
Anything the proof cannot establish, such as an unquoted expansion, a recursive `chmod`, or `sudo`, requires approval.

The full rule set lives in [`decide-tool-call.ts`](./src/application/decide-tool-call.ts) and the [`src/proof/`](./src/proof/) modules.

The exception is a pre-execution check on the filesystem as it is then, not a sandbox.
Another process with the user's privileges can swap a checked directory for a symlink between check and execution, and such a process could equally act on the external path itself.

## Known limitations

The extension does not check Pi's `shellCommandPrefix` and `shellPath` settings.
Either can redefine `rm`, `set`, or `mktemp` before a command the temporary directory exception allowed, so do not rely on the exception in a session that sets them.
The extension cannot read them reliably.
Pi captures them when it builds the Bash tool, and a later read from the settings files can differ from the value the tool runs with.

## Requirements

- macOS or Linux; the plugin deliberately does not support Windows.
- Pi 0.84.0 or later, the first release whose extension model registry exposes the `complete()` request API and whose catalog includes `gpt-5.6-luna` for all three providers.
- `jq`, for the Claude-format hook to inspect hook input.

## Install (Pi)

```bash
pi install ./plugins/security-guard
```

Project-local install into `.pi/settings.json`:

```bash
pi install -l ./plugins/security-guard
```

One-off testing without installing:

```bash
pi -e ./plugins/security-guard/index.ts
```

## Development

`oxlint` lints and `oxfmt` formats the package; both are configured in `.oxlintrc.json` and `.oxfmtrc.json`.

```bash
pnpm run lint          # oxlint, warnings fail
pnpm run lint:fix      # apply only the fixes oxlint considers safe, then review the diff
pnpm run format        # rewrite files with oxfmt
pnpm run format:check  # fail on unformatted files
pnpm run check         # lint, format check, tests, typecheck
```

`.oxlintrc.json` turns off a short list of rules and states the reason for each one.

Review every `--fix` result before keeping it.
`unicorn/no-useless-spread` and `unicorn/prefer-set-has` both read any `.slice()` call as an array clone without checking the receiver, so on a string they report a false positive and offer a fix that changes behavior: the first drops the spread that makes `.some` valid, and the second turns substring `includes` checks into a lookup in a set of single characters.
Both rules stay enabled and are suppressed with an `oxlint-disable-next-line` comment at the one line each affects, in `src/proof/path-operands.ts` and `src/infrastructure/node/temporary-root.ts`.
The test suite catches either fix if it is ever applied: the spread removal throws, and the set rewrite lets `isInsideTemporaryRoot` accept a `**` glob.

## Authors

[dhohner](https://github.com/dhohner)
