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

Without the flag, the built-in `default` style is active and the system prompt is unchanged.

Switch the style inside a running session:

- `/output-style` opens a selector that lists every style with its name, description, and source and marks the active one.
  Cancelling the selector changes nothing.
- `/output-style <name>` switches directly, with argument autocompletion over the discovered names.
  An unknown name is reported and leaves the active style unchanged.
- `Ctrl+Shift+Y` activates the next style in the list and wraps from the last entry to the first.
  Some terminals do not deliver this key combination; the command reaches every switch the shortcut can perform.

A switch replaces the flag selection for the rest of the session and takes effect from the next agent turn on.
Answers already produced are unchanged and the session is not restarted.
The footer shows the active style as `style:<name>` while the plugin is loaded, and every switch updates it immediately.
Switching to the already active style is allowed, changes nothing, and is not an error.

A style never changes the provider, the model, the thinking level, or the active tool set, so a style is safe at any point of a session.
No bundled style uses `replace` mode.

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

Without the flag, `default` is active silently.
Any supplied `--output-style` value that matches no style name, a blank value included, leaves `default` active and is reported once.

## Known Limitations

- Style files are read at session start.
  A style file added or edited while a session runs takes effect at the next session, so the selector shows the list as it was at session start.
- The selection is not persisted across sessions.
- A switch requested while an agent turn is running applies to the next turn, never to the turn in flight, because the prompt for a running turn is already assembled.

## Bundled Styles

| Style         | Description                                                    |
| ------------- | -------------------------------------------------------------- |
| `default`     | Pi's standard behavior, with no added style instructions.       |
| `explanatory` | Explains the reasoning behind each change while doing the work. |

## Install

```bash
pi install ./plugins/output-styles
```

The plugin has one runtime dependency, `yaml`, declared in `dependencies`.
An `npm:` or `git:` install runs `npm install` for it.
A local path install does not, so run `pnpm install` in this repository first.
Pi's own `yaml` copy is not visible to a plugin, and a missing dependency stops the extension from loading.

## Development

```bash
pnpm --filter output-styles test
pnpm --filter output-styles typecheck
```
