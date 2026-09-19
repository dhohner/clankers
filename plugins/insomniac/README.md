# Insomniac plugin

Claude Code status line with the model, effort level, context window usage, and whether `caffeinate` keeps the Mac awake.

```text
Opus 5 · high · ━━━━━━━╸──────────── 38% 76k/200k                 ☕ awake
```

## Segments

| Segment | Source | Notes |
| --- | --- | --- |
| Model | `model.display_name`, or `model.id` without a display name | Bold. A trailing note such as `(1M context)` is dropped, because the token count shows the window size. |
| Effort level | `effort.level` | Magenta. Left out for models without effort support. |
| Context window usage | `context_window.used_percentage`, `total_input_tokens`, `context_window_size` | 20 cells of 5% each, and a half cell for at least 2.5% more. Green below 50%, yellow from 50%, red from 80%. Shows an empty bar and `--` until the first response reports usage. |
| Sleep state | Process table | At the right edge. Yellow while awake, dim otherwise. See [Sleep state](#sleep-state). |

The line leaves out a segment when Claude Code does not send its field.
With invalid session JSON, the line shows only the sleep state.
The colors are the terminal theme's standard ANSI colors, so they follow light and dark themes.
Set `NO_COLOR` to print the line without colors.

Claude Code passes the terminal width to the script in `COLUMNS`.
The script uses it to push the sleep state to the right edge, 4 columns short of the width to leave room for Claude Code's indent.
When the terminal is too narrow, or `COLUMNS` is missing, the sleep state follows the other segments after a ` · ` separator.

## Sleep state

On macOS, Claude Code keeps the Mac awake on its own while it works on a prompt.
It runs `caffeinate -i -t 300` as a child process, restarts it every 4 minutes while the turn continues, and kills it about 30 seconds after the turn ends.
It also releases the assertion while a permission prompt waits for you.

[`scripts/statusline.sh`](./scripts/statusline.sh) looks for a `caffeinate` process whose parent is the Claude Code process that runs the status line.

| Output | Meaning |
| --- | --- |
| `☕ awake` | Claude Code holds a `caffeinate` assertion, so the Mac does not idle sleep. |
| `💤 can sleep` | No assertion from this session. The Mac follows its normal sleep settings. |

The script ignores `caffeinate` processes that other programs or other Claude Code sessions started.

## Setup

A plugin cannot set the Claude Code status line, so point `statusLine` in `~/.claude/settings.json` at the script in the marketplace checkout.
That path stays the same when the plugin updates.

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/plugins/marketplaces/clankers/plugins/insomniac/scripts/statusline.sh",
    "refreshInterval": 5
  }
}
```

If you added the marketplace from a local directory, use that directory instead of `~/.claude/plugins/marketplaces/clankers`.

`refreshInterval` reruns the script every 5 seconds.
Without it, the status line updates only on events such as a new message, so `☕ awake` stays after the assertion ends.
Claude Code reruns the script when the model, effort level, or token usage changes, so those segments need no refresh.

## Requirements

- macOS.
  On other systems Claude Code runs no `caffeinate`, and the script always shows `💤 can sleep`.
- `jq`, which macOS 15 and later ship as `/usr/bin/jq`.
  Without it, the line shows only the sleep state.

## Limits

- `caffeinate -i` prevents idle sleep only.
  The display still turns off, and closing a laptop lid still puts the Mac to sleep unless it runs in clamshell mode with power and an external display.
- The status line shows the state from its last run, so it can lag the real state by up to `refreshInterval` seconds.

## Authors

[dhohner](https://github.com/dhohner)
