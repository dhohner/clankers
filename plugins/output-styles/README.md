> This repository contains generated distribution files.
> For development instructions, tests, and contributions, use [clankers-dev](https://github.com/dhohner/clankers-dev).

# Output Styles plugin

Output Styles is a Pi extension that selects a named response style at session start and adds its instructions to the agent system prompt.

The plugin targets Pi only.
Claude Code and GitHub Copilot have an equivalent feature natively.

## How it works

Start a session with a style:

```bash
pi --output-style explanatory
```

The plugin appends style instructions to the chained system prompt for every agent turn.
It preserves Pi's guidance, custom system prompts, loaded context, skills, and earlier extensions' prompt changes without rebuilding them.
Later extensions can still modify the prompt.

Only append behavior is supported.
The plugin skips legacy files declaring `mode: replace` and reports how to migrate them.
It leaves those files unchanged.
To migrate, review the instructions for use alongside Pi's guidance, then remove the `mode` field or change it to `mode: append`.
Startup skips an unavailable selection and continues through the normal fallback order.
If a rescan rejects the active style and no definition with the same name remains, the plugin falls back to `default` without changing the persisted selection.

If the flag does not name a known style, startup checks the saved project selection, then the saved global selection, then uses the built-in `default` style.
See Persistence for the full rules.
Under `default` the system prompt is unchanged, so a fresh installation without the flag behaves exactly like Pi without this plugin.

Switch the style inside a running session:

- `/output-style` opens a selector that lists every style with its name, description, and source and marks the active one.
  Cancelling the selector changes nothing.
- `/output-style <name>` switches directly, with argument autocompletion over the discovered names.
  An unknown name is reported and leaves the active style unchanged.
- `Ctrl+Shift+Y` activates the next style in the list and wraps from the last entry to the first.
  Some terminals do not deliver this key combination.
  The command supports every switch available through the shortcut.
  Pi's `~/.pi/agent/keybindings.json` rebinds Pi's own actions by their keybinding id, but an extension shortcut is registered under its literal key and has no id in that file, so this shortcut cannot be rebound there; verified against Pi 0.87.1.
  To use a different key, change the `CYCLE_SHORTCUT` constant in the installed copy of `src/pi/registration.ts` to a combination in Pi's `modifier+key` format, such as `ctrl+shift+x`.

Every `/output-style` invocation, with or without an argument, rescans the three style directories first, so a style file added or edited while the session runs is selectable without a restart.
The one exception is `/output-style new` without a user interface: it refuses before the rescan, so the invocation produces exactly one explanatory message and changes nothing.
When a rescan cannot list a directory that the most recent successful scan listed, the previous style list stays in use, the failure is reported with the path and the reason, and the command continues with that list.
That report repeats on every invocation that keeps the previous list, so the stale state stays visible for as long as it lasts.
Every other discovery problem, a skipped style file for example, is reported at most once per session for the same path and reason.
The cycle shortcut and the argument autocompletion use the list as it was at the last scan.
After a rescan adopts a fresh list, the active style updates from its file.
An edited definition takes effect on the next agent turn.
If the active name is missing from the new list, the plugin reports it and falls back to the built-in `default` style.
The fallback never changes the persisted selection, so a temporarily broken style is not lost across sessions.

A switch replaces the flag selection for the rest of the session and takes effect on the next agent turn.
Answers already produced are unchanged and the session is not restarted.
The footer status line shows the active style as a dim `style` label followed by the style name in the theme accent color, and every switch updates it immediately.
When Insomniac supplies the footer, it displays this entry in square brackets after the sleep state on the right, with a dot separator.
It uses the current theme's accent color and omits the separate style status row.
While the built-in `default` style is active, the plugin adds no style instructions and writes no footer entry, leaving the shared status line free for other extensions.
The colors follow the active Pi theme.
Each agent turn renders the entry again, so a theme change takes effect on the next turn.
Switching to the already active style is allowed, changes nothing, and is not an error.

Create a style inside a running session:

- `/output-style new` collects the style name, the description, the target directory, and the instruction text through dialogs, writes `<name>.md` into the chosen style directory, and activates the new style immediately through the normal switch path, footer update and persistence included.
- The name must consist of letters, digits, dash, and underscore only and must not be the reserved `default` or `new`.
  A refused name, description, or instruction text is reported with the reason and the same dialog opens again.
- A name whose file `<name>.md` already exists in the chosen directory is refused and stops the flow.
  A name that only matches a style from a different source directory is accepted and follows the normal precedence rules, so the definition those rules select is the one activated after the write.
- The target selection offers the user style directory always and the project style directory only in a trusted project.
  When only the user directory is available, the dialog is skipped.
- Cancelling any dialog stops the flow and changes nothing on disk.
  Nothing is written until every input is collected and valid; only then a missing target directory is created and the file is written, never over an existing file.
- The written file holds the description as its only frontmatter field and the instruction text as the body, so the name derives from the filename and the mode is the default `append`.
  A parse of the written file yields exactly the accepted values: because the file parser strips outer whitespace on every read, a description or instruction text with leading or trailing whitespace is refused with the reason instead of being changed silently.
  A trailing newline counts as trailing whitespace: Pi strips its external editor's terminating newline itself, so the flow never strips anything silently.
  After a whitespace refusal the editor re-opens prefilled with the trimmed text.

You can switch styles at any point in a session because they leave the provider, model, thinking level, and active tool set unchanged.
All styles append instructions to the existing prompt.

## Scope

- Reads style files from the three style directories listed under Style Sources, at session start and on every `/output-style` invocation
- Reads the `outputStyle` key from Pi's global settings file and, in a trusted project, from the project settings file
- Writes the `outputStyle` key, on every in-session switch, to the settings file the trust rule selects
- Writes one new style file into the chosen style directory when the `/output-style new` create flow completes, and creates that directory when it is missing; a write that fails midway is reported together with the possibly incomplete file left at the path, and no other file is created, changed, or removed
- Rewrites the assembled system prompt of each agent turn while a non-default style is active, and touches nothing else of the request
- Runs no shell command and makes no network request

## Persistence

Each style switch during a session is saved immediately to Pi's settings under the `outputStyle` key.
The write target follows project trust: `<cwd>/<pi config dir>/settings.json` in a trusted project, `<agent dir>/settings.json` otherwise, so an untrusted project is never written to.
The write changes only the `outputStyle` key and keeps every other settings key, nested objects included.
Writes are serialized within the session and take the same file lock Pi's own settings writer uses, so rapid switches and concurrent Pi settings writes cannot interleave into a corrupted file.
When the write fails, the switch stays active for the running session and the failure is reported.

The starting style of a session resolves in this order, taking the first value that names a known style:

1. the `--output-style` flag value;
2. the project settings value, when the project is trusted;
3. the global settings value; and
4. the built-in `default` style.

The flag is a one-run override and is never written to settings.
A consulted value that names no known style is reported once and skipped, and its value on disk stays unchanged, so a temporarily unavailable project style is not lost.

If a settings file is missing, has no `outputStyle` key, or stores an empty string for that key, it contains no selection.
The session starts without reporting this.
A settings file that cannot be read is reported with its path and the reason, and the session continues with the remaining sources.
That covers a settings lock that stays held past the retry window, a read that fails, content that is not valid JSON, content that is not a JSON object, and a value that is not a string.
The two settings files are read independently, so each one reports its own failure, and an untrusted project's settings file is neither read nor reported.
The read takes the same lock as the write, changes nothing on disk, and creates no lock directory next to a settings file that does not exist.

## Modes without a user interface

The style resolves and applies identically in every Pi run mode, so a scripted `pi -p` or `--mode json` run follows the same persisted or flag-selected style as an interactive session.

The terminal surfaces follow Pi's `hasUI` flag, which is true in TUI and RPC modes and false in print and JSON modes:

- The cycle shortcut is registered only when a user interface exists.
- The footer status is set only when a user interface exists.
- `/output-style <name>` still switches by name wherever commands can be invoked, and never opens a dialog without a user interface.
- `/output-style` without an argument reports the available style names on standard error instead of opening the selector.
- `/output-style new` refuses with one explanatory message, because the create flow collects its inputs through dialogs; no file is written and standard output stays untouched.
  The refusal happens before the usual rescan and any scan diagnostics, since this invocation does not use scan results.

Without a user interface, every message the plugin produces, such as a skipped malformed file or an unknown style name, is written to standard error with an `output-styles:` prefix.
Standard output stays untouched, because in print and JSON mode it carries the agent answer a caller parses.

Project trust follows Pi's own rules: non-interactive modes show no trust prompt, so without a saved decision the `defaultProjectTrust` setting decides whether project styles and the project settings value are read.

## Style sources

Style files are read from three directories, none of them recursively:

| Source  | Directory                                | Read when                        |
| ------- | ---------------------------------------- | -------------------------------- |
| bundled | `styles/` inside this plugin             | always                           |
| user    | `<agent dir>/output-styles/`             | always                           |
| project | `<cwd>/<pi config dir>/output-styles/`   | only when the project is trusted |

`<agent dir>` is Pi's global agent directory, and `<pi config dir>` is Pi's configured project directory name, normally `.pi`.

When the same style name comes from more than one source, project wins over user, and user wins over bundled.
Only the winning definition is selectable, and a shadowed definition produces no message.

Two files in one directory that resolve to the same style name are a collision inside that source: the file whose name sorts first wins, and the other one is reported as skipped.

`default` is reserved for the built-in no-op style, as an exception to that precedence.
A style file that resolves to `default`, by filename or by the `name` field, is skipped and reported.
This keeps a session without the flag always unchanged, and keeps one name from resolving to two different styles.

`new` is also reserved, for the `/output-style new` create subcommand, so a discovered style can never shadow that subcommand.
A style file that resolves to `new`, by filename or by the `name` field, is skipped and reported.
To make such a file selectable, rename the file or change its `name` field.

Style names are matched exactly and case-sensitively.
The style list is ordered by name with `default` first.

## Style file format

A style file is a Markdown file with YAML frontmatter:

```markdown
---
name: terse
description: Answers in as few words as the question allows.
mode: append
---

Answer in one or two sentences.
Skip preamble, restatement of the question, and closing offers of further help.
```

- `description` is required and must be non-empty.
- `name` is optional and defaults to the filename without the `.md` suffix.
- `mode` is optional and accepts only `append`, which is also the default.
- `mode: replace` is no longer supported and causes the file to be skipped with migration instructions.
- The body after the frontmatter is the style instruction text and must be non-empty.

A commented copy of this example ships at [`examples/terse.md`](./examples/terse.md).
Copy it into a style directory, for example `~/.pi/agent/output-styles/terse.md`, edit it, and the next `/output-style` invocation offers the style.
The `examples/` directory itself is not a style directory, so the shipped copy does not appear in the style list.

Only a `---` line at column zero opens or closes the frontmatter block, so an indented `---` stays part of a field value.

The block is parsed with the [`yaml`](https://www.npmjs.com/package/yaml) library, so every YAML spelling of a scalar works, including plain, quoted, folded (`>`), and literal (`|`) values and `\uXXXX` escapes.
Two settings narrow the accepted set:

- The YAML 1.2 core schema, so `mode: no` is the string `no` and not a boolean.
- Aliases are refused, because a style file has nothing to reference.

A style file must contain a mapping of scalar fields.
A field holding a mapping or a sequence, a block that is not a mapping, a duplicate key, and unreadable YAML are each reported with the reason and the parser message, never read as literal text.

A malformed file is skipped instead of failing the session.
Missing frontmatter, unreadable YAML, a non-scalar field, a missing or empty `description`, an empty `name`, an unknown `mode` value, an empty body, the reserved `default` and `new` names, and a read error each exclude one file from the style list.
The path and the reason are reported once per session, and every other style stays selectable.

Any supplied `--output-style` value that matches no style name, a blank value included, is reported once, and startup resolution falls through to the persisted settings values and then to `default`, as the Persistence section describes.

## Known limitations

- A switch requested while an agent turn is running applies to the next turn, never to the turn in flight, because the prompt for a running turn is already assembled.

## Bundled Styles

| Style         | Description                                                                           |
| ------------- | ------------------------------------------------------------------------------------- |
| `default`     | Pi's standard behavior, with no added style instructions.                             |
| `unslop`      | Direct, concrete technical prose without canned AI wording.                           |
| `explanatory` | Adds short insight notes about the codebase and the reasoning behind choices.         |
| `learning`    | Collaborates and asks you to write small, clearly marked pieces of the code yourself. |

All four use `append` mode.

## Install

This plugin requires Pi 0.87.1 or later, the version it is built and tested against.
It declares `@earendil-works/pi-coding-agent` as an optional peer dependency with `*`, so Pi supplies the runtime package.
The `*` specifier is required here.
Under `autoInstallPeers`, pnpm 12.3.4 resolves a range here as a normal dependency and drops the optional markers from Pi's platform-specific clipboard binaries in `pnpm-lock.yaml`, which would make a Linux or Windows install try to fetch the macOS binary.

```bash
pi install ./plugins/output-styles
```

The plugin has two runtime dependencies, `proper-lockfile` and `yaml`, declared in `dependencies`.
An `npm:` or `git:` install runs `npm install` for them.
A local path install does not, so run `pnpm install` in this repository first.
Pi's own `yaml` copy is not visible to a plugin, and a missing dependency stops the extension from loading.

## Development

`index.ts` re-exports the host bootstrap from `src/pi/extension.ts`.
`src/pi/` contains registration, host contracts, dialogs, and footer formatting.
`src/styles/` contains style definitions, parsing, discovery, serialization, and prompt application.
`src/session/` owns the catalogue, active selection, scan adoption, and startup selection rules.
`src/storage/` contains filesystem operations, JSON parsing, settings storage, and the persistence contract.
`src/errors.ts` formats errors shared by these modules.
Tests mirror these directories, and `test/pi/` exercises registration through the harness.
`test/integration/` checks dependency boundaries, package layout, and loading and lifecycle dispatch through Pi.
`test/support/` contains shared fixtures, and `test/regressions/` covers specific fixed defects.

### Invariants

Keep these rules together when changing discovery, session state, or persistence.
The paths below are relative to this plugin.

- Style sources: project definitions take precedence over user definitions, then bundled definitions.
  `src/styles/discovery.ts` owns source merging, reserved name rejection, filename ordering for collisions within a directory, and locale ordering with the built-in `default` first.
  Coverage: `test/styles/discovery.test.ts` checks precedence, deterministic collisions, an empty catalogue, case ordering, and reserved names.
- Startup selection: the flag takes precedence over trusted project settings, then global settings, then the built-in default.
  Each consulted unknown name is reported and resolution continues to the next source.
  `src/session/startup-selection.ts` owns resolution; `src/pi/registration.ts` reads settings and reports misses.
  Coverage: `test/session/startup-selection.test.ts` and `test/pi/style-persistence.test.ts`.
- Project trust: untrusted project style files and settings are never read, and settings writes target the project only when trusted; otherwise they target global settings.
  `src/pi/registration.ts` owns directory selection and settings targets.
  Coverage: `test/pi/style-application.test.ts`, `test/pi/style-persistence.test.ts`, and `test/pi/persistence-failures.test.ts`.
- Catalogue consumers: commands rescan before acting, except `/output-style new` without a user interface, which refuses before scanning.
  Completions and the cycle shortcut use the adopted catalogue without scanning.
  `src/pi/registration.ts` owns these entry points.
  Coverage: `test/pi/style-rescan.test.ts`, `test/pi/style-switching.test.ts`, and `test/pi/headless-modes.test.ts`.
- Scan adoption: a directory that becomes unlistable causes the previous catalogue to be retained; a directory already unlistable in the adopted scan does not prevent adoption.
  `src/session/style-session.ts` owns the comparison with the adopted scan.
  Coverage: `test/session/style-session.test.ts` and `test/pi/style-rescan.test.ts`.
- Active definitions: an adopted scan refreshes the active definition by name.
  If that name is unavailable, the built-in default becomes active without rewriting persisted settings.
  `src/session/style-session.ts` owns refresh and fallback; `src/pi/registration.ts` reports fallback without invoking persistence.
  Coverage: `test/session/style-session.test.ts` and `test/pi/active-style-rescan.test.ts`.
- Selectors: a selector retains the catalogue snapshot shown when its dialog opened, even if another command adopts a scan before the selection returns.
  `src/session/style-session.ts` replaces catalogue arrays instead of mutating them; `src/pi/registration.ts` captures the offered array and labels.
  Coverage: `test/session/style-session.test.ts` and the concurrent dialog test in `test/pi/style-rescan.test.ts`.
- Diagnostics: skipped problems are reported once for each path and reason across session starts within a loaded extension instance.
  Kept directories are reported once per command invocation, including creation commands that scan twice.
  `src/session/style-session.ts` owns deduplication; `src/pi/registration.ts` shares the invocation's set with `src/pi/create-flow.ts`.
  Coverage: `test/session/style-session.test.ts`, `test/pi/style-rescan.test.ts`, and `test/pi/create-flow.test.ts`.
- Serialization: rescan discovery and adoption run in one queue, so an older scan cannot overwrite a newer catalogue.
  Settings writes are serialized for each path and take the same file lock as Pi.
  `src/session/style-session.ts` owns the scan queue; `src/storage/settings.ts` owns write queues and locks.
  Coverage: the scan ordering test in `test/session/style-session.test.ts` and the concurrent write and lock tests in `test/storage/settings.test.ts`.
- Explicit switches: selection takes effect before persistence finishes.
  A failed save is reported without reverting the active selection, including when a later switch occurs while an earlier save is pending.
  `src/pi/registration.ts` owns activation and save error reporting.
  Coverage: `test/pi/persistence-failures.test.ts` and `test/pi/style-persistence.test.ts`.

### Validation

```bash
pnpm --filter output-styles test
pnpm --filter output-styles typecheck
```

The test run randomizes files and tests to expose tests that depend on another test's position.
Vitest rejects focused tests and tests without assertions.
Vitest also restores spies, environment stubs, and global stubs before each test.
Assert a list with `toEqualUnordered`, the custom matcher in `test/support/matchers.ts`, wherever the code promises no order.
Use `toEqual` only where order is the contract, such as the style list order and a sequence of reported messages.
The shipped styles are listed once, in `BUNDLED_STYLES` of `test/styles/bundled-styles.test.ts`, and a test compares that list with the README table above, so a renamed style needs one edit in the tests and one in the README.
