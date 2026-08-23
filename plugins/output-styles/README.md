# Output Styles Plugin

Pi extension that selects a named response style at session start and applies its instruction text to the agent system prompt.

The plugin targets Pi only.
Claude Code and GitHub Copilot have an equivalent feature natively.

## What It Does

Start a session with a style:

```bash
pi --output-style explanatory
```

In `append` mode, the default, the style instruction text is appended to the end of the system prompt for every agent turn of that session, after the project instruction files and context files Pi already loaded, so the style is the last instruction the model reads.

In `replace` mode the style instruction text takes the place of Pi's response and behavior guidance.
The system prompt for the turn is rebuilt from the structured options Pi assembled, so the tool list, the tool guidelines, the loaded context files, the loaded skills, and the working directory stay in the prompt.
The style text opens the rebuilt prompt as the governing response instruction, and the retained sections follow in Pi's own order.
A replace-mode style also drops the system prompt changes of extensions that ran earlier in the chain, because the prompt is rebuilt from Pi's options instead of the chained text.
The structured option fields were verified against Pi 0.84.1.

A replace-mode style takes over the whole response guidance, and Pi's own behavior instructions are gone for that turn.
When the style text contradicts or ignores the retained tool guidance, the agent can get noticeably weaker at its actual work, so prefer `append` unless the style truly must own the full response contract.

Without a flag value that names a known style, the starting style comes from the persisted project settings value, then the persisted global settings value, then the built-in `default` style, as the Persistence section describes.
Under `default` the system prompt is unchanged, so a fresh installation without the flag behaves exactly like Pi without this plugin.

Switch the style inside a running session:

- `/output-style` opens a selector that lists every style with its name, description, and source and marks the active one.
  Cancelling the selector changes nothing.
- `/output-style <name>` switches directly, with argument autocompletion over the discovered names.
  An unknown name is reported and leaves the active style unchanged.
- `Ctrl+Shift+Y` activates the next style in the list and wraps from the last entry to the first.
  The shortcut is a convenience: some terminals do not deliver this key combination, and the command reaches every switch the shortcut can perform.
  Pi's `~/.pi/agent/keybindings.json` rebinds Pi's own actions by their keybinding id, but an extension shortcut is registered under its literal key and has no id in that file, so this shortcut cannot be rebound there; verified against Pi 0.84.1.
  To use a different key, change the `CYCLE_SHORTCUT` constant in the installed copy of `lib/extension.ts` to a combination in Pi's `modifier+key` format, such as `ctrl+shift+x`.

Every `/output-style` invocation, with or without an argument, rescans the three style directories first, so a style file added or edited while the session runs is selectable without a restart.
The one exception is `/output-style new` without a user interface: it refuses before the rescan, so the invocation produces exactly one explanatory message and changes nothing.
When a rescan cannot list a directory that the most recent successful scan listed, the previous style list stays in use, the failure is reported with the path and the reason, and the command continues with that list.
That report repeats on every invocation that keeps the previous list, so the stale state stays visible for as long as it lasts.
Every other discovery problem, a skipped style file for example, is reported at most once per session for the same path and reason.
The cycle shortcut and the argument autocompletion use the list as it was at the last scan.
After a rescan adopts a fresh list, the active style follows its file: an edited definition takes effect from the next agent turn, and a name the fresh list no longer offers falls back to the built-in `default` style with a report.
The fallback never changes the persisted selection, so a temporarily broken style is not lost across sessions.

A switch replaces the flag selection for the rest of the session and takes effect from the next agent turn on.
Answers already produced are unchanged and the session is not restarted.
The footer status line shows the active style as a dim `style` label followed by the style name in the theme accent color, and every switch updates it immediately.
While the built-in `default` style is active, the plugin writes no footer entry at all: no style instructions are in effect, so the shared status line stays free for other extensions.
The colors follow the active Pi theme, and every agent turn renders the entry again, so a theme switched during a session takes effect from the next turn on.
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

A style never changes the provider, the model, the thinking level, or the active tool set, so a style is safe at any point of a session.
No bundled style uses `replace` mode.

## Scope

- Reads style files from the three style directories listed under Style Sources, at session start and on every `/output-style` invocation
- Reads the `outputStyle` key from Pi's global settings file and, in a trusted project, from the project settings file
- Writes the `outputStyle` key, on every in-session switch, to the settings file the trust rule selects
- Writes one new style file into the chosen style directory when the `/output-style new` create flow completes, and creates that directory when it is missing; a write that fails midway is reported together with the possibly incomplete file left at the path, and no other file is created, changed, or removed
- Rewrites the assembled system prompt of each agent turn while a non-default style is active, and touches nothing else of the request
- Runs no shell command and makes no network request

## Persistence

Every in-session switch is written immediately to Pi's settings under the `outputStyle` key.
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

A settings file that does not exist, that holds no `outputStyle` key, or that holds the empty string as its value is no stored selection, and the session starts without a message about it.
A settings file that cannot be read is reported with its path and the reason, and the session continues with the remaining sources.
That covers a settings lock that stays held past the retry window, a read that fails, content that is not valid JSON, content that is no JSON object, and a value that is no string.
The two settings files are read independently, so each one reports its own failure, and an untrusted project's settings file is neither read nor reported.
The read takes the same lock as the write, changes nothing on disk, and creates no lock directory next to a settings file that does not exist.

## Modes Without a User Interface

The style resolves and applies identically in every Pi run mode, so a scripted `pi -p` or `--mode json` run follows the same persisted or flag-selected style as an interactive session.

The terminal surfaces follow Pi's `hasUI` flag, which is true in TUI and RPC modes and false in print and JSON modes:

- The cycle shortcut is registered only when a user interface exists.
- The footer status is set only when a user interface exists.
- `/output-style <name>` still switches by name wherever commands can be invoked, and never opens a dialog without a user interface.
- `/output-style` without an argument reports the available style names on standard error instead of opening the selector.
- `/output-style new` refuses with one explanatory message, because the create flow collects its inputs through dialogs; no file is written and standard output stays untouched.
  The refusal skips the usual rescan, so no scan diagnostic can dilute that one message; the invocation acts on nothing the rescan could change.

Without a user interface, every message the plugin produces, such as a skipped malformed file or an unknown style name, is written to standard error with an `output-styles:` prefix.
Standard output stays untouched, because in print and JSON mode it carries the agent answer a caller parses.

Project trust follows Pi's own rules: non-interactive modes show no trust prompt, so without a saved decision the `defaultProjectTrust` setting decides whether project styles and the project settings value are read.

## Style Sources

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

## Style File Format

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
- `mode` is optional, allows `append` and `replace`, and defaults to `append`.
- The body after the frontmatter is the style instruction text and must be non-empty.

A commented copy of this example ships at [`examples/terse.md`](./examples/terse.md).
Copy it into a style directory, for example `~/.pi/agent/output-styles/terse.md`, edit it, and the next `/output-style` invocation offers the style.
The `examples/` directory itself is not a style directory, so the shipped copy joins no style list.

Only a `---` line at column zero opens or closes the frontmatter block, so an indented `---` stays part of a field value.

The block is parsed with the [`yaml`](https://www.npmjs.com/package/yaml) library, so every YAML spelling of a scalar works, including plain, quoted, folded (`>`), and literal (`|`) values and `\uXXXX` escapes.
Two settings narrow the accepted set:

- The YAML 1.2 core schema, so `mode: no` is the string `no` and not a boolean.
- Aliases are refused, because a style file has nothing to reference.

The style file contract is a mapping of scalar fields.
A field holding a mapping or a sequence, a block that is not a mapping, a duplicate key, and unreadable YAML are each reported with the reason and the parser message, never read as literal text.

A malformed file is skipped instead of failing the session.
Missing frontmatter, unreadable YAML, a non-scalar field, a missing or empty `description`, an empty `name`, an unknown `mode` value, an empty body, the reserved `default` and `new` names, and a read error each exclude one file from the style list.
The path and the reason are reported once per session, and every other style stays selectable.

Any supplied `--output-style` value that matches no style name, a blank value included, is reported once, and startup resolution falls through to the persisted settings values and then to `default`, as the Persistence section describes.

## Known Limitations

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

This plugin requires Pi 0.84.1 or later and builds against the `@earendil-works/pi-coding-agent` package, declared as a peer dependency with `>=0.84.1`.

```bash
pi install ./plugins/output-styles
```

The plugin has two runtime dependencies, `proper-lockfile` and `yaml`, declared in `dependencies`.
An `npm:` or `git:` install runs `npm install` for them.
A local path install does not, so run `pnpm install` in this repository first.
Pi's own `yaml` copy is not visible to a plugin, and a missing dependency stops the extension from loading.

## Development

```bash
pnpm --filter output-styles test
pnpm --filter output-styles typecheck
```

The test run randomizes files and tests, so a test that depends on another test fails instead of passing by position.
Vitest rejects focused tests and tests without assertions.
Vitest also restores spies, environment stubs, and global stubs before each test.
Assert a list with `toEqualUnordered`, the custom matcher in `test/support/matchers.ts`, wherever the code promises no order.
Use `toEqual` only where order is the contract, such as the style list order and a sequence of reported messages.
The shipped styles are listed once, in `BUNDLED_STYLES` of `test/bundled-styles.test.ts`, and a test compares that list with the README table above, so a renamed style needs one edit in the tests and one in the README.
