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

The `.pem` rule exempts the public certificate names `cert.pem`, `fullchain.pem`, `chain.pem`, `ca.pem`, `cacert.pem`, and any name ending in `-cert.pem`, in any directory.
Every other `.pem` path stays blocked, including `key.pem`, `privkey.pem`, `mycert.pem`, and `CERT.pem`, whose capitals the exemption does not match.
The exemption applies to the generic `.pem` rule only: a `.pem` file under `.ssh/` stays blocked, and a command naming an exempt certificate beside a blocked key, such as `cat cert.pem key.pem`, is blocked.

## Destructive command approval (Pi)

The Pi extension requires explicit UI approval before Bash commands that can destroy work:

- removal and overwrite: `rm`, `rmdir`, `unlink`, `shred`, `truncate`, `dd`, `mkfs`
- risky `mv`, `chmod`, and `chown`, including forced moves and modes that add write permission
- Git commands that discard state: `git reset --hard`, non-dry-run `git clean`, forced or deleting `git push`, and working-tree overwrites such as `git rm`, `git restore`, and `git checkout` with a pathspec

The analyzer resolves wrappers (`sudo`, `env`, `xargs`, `nice`, `timeout`, `find -exec`, `eval`, and others) to the command they run, and reads nested `bash -c` scripts as command lists of their own.
Anything it cannot prove safe requires approval: a command word built by expansion, an unknown option that could hide an operand, or shell syntax the tokenizer does not accept.
In non-interactive mode the extension blocks these commands outright instead of prompting.

### Accepted shell grammar

The tokenizer reads test expressions `[[ ... ]]`, the arithmetic expansion `$(( ... ))`, and the process substitutions `<( ... )` and `>( ... )`, and inspects every command list inside them, so `diff <(rm -rf build) a.ts` asks for approval and `[[ -f a && -f b ]]` does not.
An arithmetic operand this text does not show fails closed: `[[ $x -eq 1 ]]` and `echo $((x))` ask, because bash evaluates the variable's value as an expression that can carry a substitution of its own.

Two constructs still ask whatever they contain: a function definition, such as `cleanup() { rm -rf build; }`, and the `;&` fall-through operator of `case`.
So do the arithmetic command `(( ... ))` and the deprecated `$[ ... ]`, whose expressions the policy cannot read.

### Here-document bodies

A here-document body is data, not shell commands, unless the program reading it is one of `bash`, `sh`, `zsh`, `ksh`, `dash`, and `ash`.
`cat <<'EOF'` and `psql <<'SQL'` may hold any text; `bash <<'EOF'` and `sudo bash <<'SQL'` ask for approval, as does a body whose reader cannot be resolved, such as `$c <<'EOF'` or `nice --unknown psql <<'EOF'`.

The current shell expands an unquoted body before the reader sees it, so a command substitution there is still inspected whatever the reader is: `psql <<EOF` with `$(rm -rf build)` in the body asks for approval, while the same body under the quoted delimiter `<<'EOF'` does not.

### Questions the host answers

Two forms are read as destructive from their text alone and then cleared by one filesystem inspection, when the call is a single simple command whose words the shell passes through unchanged.

- A `git checkout` with a lone operand asks whether a file of that name exists in the working directory, and needs no approval when none does: `git checkout main` runs unattended, `git checkout README.md` asks.
- An `mv` with more than two operands asks whether the last operand is an existing directory, and needs no approval when it is: `mv a.ts b.ts c.ts src/` runs unattended when `src` is a directory.

Every other checkout form keeps its documented verdict: `-f`, `-B`, `--ours`, `--theirs`, `-p`, and `--pathspec-from-file` ask, a second operand is a pathspec and asks, and `-b`, `--orphan`, `--track`, `--detach`, and `-` are safe without a host check.
An `mv` with `-f`, `-t`, `-T`, an absolute or glob path, or exactly two operands keeps its verdict too.

The inspection is skipped, and approval required, whenever its answer could stop holding: an expansion anywhere in the command, a redirection or here-document, a second command in the list, a leading option that moves Git's directory (`-C`, `--git-dir`, `--work-tree`, `core.worktree`), an assignment such as `GIT_DIR`, `HOME`, or `PATH`, a command word outside the system directories, or `sudo`.
Inside `bash -c`, `eval`, `xargs`, or `find -exec`, both forms stay destructive and no host is asked.

### Trap handlers

A `trap` handler is judged by its command word, because the handler runs whenever the agent's shell exits or the signal arrives.
Interpolating a variable into an operand no longer forces approval: `trap "docker rm -f $CID" EXIT` runs unattended, while `trap 'rm -rf build' EXIT` asks.
A handler whose command word is itself an expansion (`trap "$CLEANUP" EXIT`), and an expanded option or signal operand (`trap $OPTS 'echo done' EXIT`), still fail closed.

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

## Regenerable directory exception

`rm` and `rmdir` run without assessment or approval when every path the call removes resolves inside one of the regenerable build directories `node_modules`, `dist`, `build`, `target`, `.next`, `out`, and `coverage`, and that directory itself resolves inside the working directory.
No other command gets this exception: `unlink`, `truncate`, `mv`, `chmod`, and `chown` keep asking even against build output, and a call that runs any of them alongside `rm` asks.

Each name matches a whole path component, so `dist-backup` is not `dist`, and the exempt component has to be an existing directory: `rm target` asks when nothing exists at `target`, and `rm build` asks when `build` is a file.
Paths resolve the way the kernel resolves them, links included, so `rm dist/link/../node_modules` and an entry inside a `node_modules` that is a symlink out of the tree both ask.
A working directory that is itself named after an exempt directory exempts nothing, and a `node_modules` in a sibling project is outside the working directory and asks.

The two exceptions are independent: a call mixing a temporary target with a regenerable one qualifies through neither.
The rules live in [`decide-tool-call.ts`](./src/application/decide-tool-call.ts) and [`regenerable-directory.ts`](./src/infrastructure/node/regenerable-directory.ts).

## Known limitations

Every filesystem question this plugin asks the host is a pre-execution check on the filesystem as it is then, not a sandbox.
Another process with the user's privileges can swap a checked directory for a symlink between check and execution.
That risk is known and accepted, because such a process could equally act on the target path directly.
It applies alike to the temporary-directory exception, the regenerable directory exception, the `git checkout` operand check, and the `mv` destination check.

A here-document that a remote host or a container shell executes is no longer inspected.
`ssh host` and `docker exec` are not shells this policy knows, so their bodies are data: `docker exec -i pg psql -U postgres <<'SQL'` runs unattended whatever the body says.
That loss is known and accepted, because the proof cannot reason about a filesystem it cannot see.

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
