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

A switch replaces the flag selection for the rest of the session and takes effect from the next agent turn on.
Answers already produced are unchanged and the session is not restarted.
The footer shows the active style as `style:<name>` while the plugin is loaded, and every switch updates it immediately.
Switching to the already active style is allowed, changes nothing, and is not an error.

A style never changes the provider, the model, the thinking level, or the active tool set, so a style is safe at any point of a session.
No bundled style uses `replace` mode.

## Scope

- Reads style files from the three style directories listed under Style Sources, at session start only
- Reads the `outputStyle` key from Pi's global settings file and, in a trusted project, from the project settings file
- Writes only the `outputStyle` key, on every in-session switch, to the settings file the trust rule selects
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

## Modes Without a User Interface

The style resolves and applies identically in every Pi run mode, so a scripted `pi -p` or `--mode json` run follows the same persisted or flag-selected style as an interactive session.

The terminal surfaces follow Pi's `hasUI` flag, which is true in TUI and RPC modes and false in print and JSON modes:

- The cycle shortcut is registered only when a user interface exists.
- The footer status is set only when a user interface exists.
- `/output-style <name>` still switches by name wherever commands can be invoked, and never opens a dialog without a user interface.
- `/output-style` without an argument reports the available style names on standard error instead of opening the selector.

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
Copy it into a style directory, for example `~/.pi/agent/output-styles/terse.md`, edit it, and the style is offered in the next session.
The `examples/` directory itself is not a style directory, so the shipped copy joins no style list.

Only a `---` line at column zero opens or closes the frontmatter block, so an indented `---` stays part of a field value.

The block is parsed with the [`yaml`](https://www.npmjs.com/package/yaml) library, so every YAML spelling of a scalar works, including plain, quoted, folded (`>`), and literal (`|`) values and `\uXXXX` escapes.
Two settings narrow the accepted set:

- The YAML 1.2 core schema, so `mode: no` is the string `no` and not a boolean.
- Aliases are refused, because a style file has nothing to reference.

The style file contract is a mapping of scalar fields.
A field holding a mapping or a sequence, a block that is not a mapping, a duplicate key, and unreadable YAML are each reported with the reason and the parser message, never read as literal text.

A malformed file is skipped instead of failing the session.
Missing frontmatter, unreadable YAML, a non-scalar field, a missing or empty `description`, an empty `name`, an unknown `mode` value, an empty body, the reserved `default` name, and a read error each exclude one file from the style list.
The path and the reason are reported once per session, and every other style stays selectable.

Any supplied `--output-style` value that matches no style name, a blank value included, is reported once, and startup resolution falls through to the persisted settings values and then to `default`, as the Persistence section describes.

## Known Limitations

- Style files are read at session start.
  A style file added or edited while a session runs takes effect at the next session, so the selector shows the list as it was at session start.
- A switch requested while an agent turn is running applies to the next turn, never to the turn in flight, because the prompt for a running turn is already assembled.

## Bundled Styles

| Style         | Description                                                                          |
| ------------- | ------------------------------------------------------------------------------------ |
| `default`     | Pi's standard behavior, with no added style instructions.                            |
| `explanatory` | Adds short insight notes about the codebase and the reasoning behind choices.        |
| `learning`    | Collaborates and asks you to write small, clearly marked pieces of the code yourself. |
| `ste`         | Answers in ASD-STE100 Simplified Technical English with short, active sentences.     |

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
