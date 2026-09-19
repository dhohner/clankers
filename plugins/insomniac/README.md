# Insomniac plugin

The plugin shows the model, effort level, context window usage, and whether `caffeinate` keeps the Mac awake.

```text
Opus 5 · high · ━━━━━━━╸──────────── 38% 76k/200k                 ☕ awake
```

## Segments

| Segment | Source | Notes |
| --- | --- | --- |
| Model | `model.display_name`, or `model.id` without a display name | Bold. The script removes trailing notes such as `(1M context)` because token counts show the window size. |
| Effort level | `effort.level` | Magenta. Omitted for models without effort support. |
| Context window usage | `context_window.used_percentage`, `total_input_tokens`, `context_window_size` | Uses 20 cells at 5% each and a half cell for at least 2.5% more. Colors the bar green below 50%, yellow from 50%, and red from 80%. Shows an empty bar and `--` until the first response reports usage. |
| Sleep state | Process table | At the right edge. Yellow while awake, dim otherwise. See [Sleep state](#sleep-state). |

The line omits a segment when Claude Code omits its field.
With invalid session JSON, the line shows only the sleep state.
The line uses the terminal theme's standard ANSI colors, so it follows light and dark themes.
Set `NO_COLOR` to print the line without colors.

The script right-aligns the sleep state to the width in `COLUMNS`.
It stops 4 columns short to leave room for Claude Code's indent.
If the terminal is too narrow or `COLUMNS` is missing, the sleep state follows the other segments after a ` · ` separator.

## Sleep state

On macOS, Claude Code keeps the Mac awake while working on a prompt.
It runs `caffeinate -i -t 300` as a child process.
It restarts it every 4 minutes while the turn continues and kills it about 30 seconds after the turn ends.
It also releases the assertion while a permission prompt waits for you.

[`scripts/statusline.sh`](./scripts/statusline.sh) finds a `caffeinate` process whose parent is the Claude Code process running the status line.

| Output | Meaning |
| --- | --- |
| `☕ awake` | Claude Code holds a `caffeinate` assertion, so the Mac does not idle sleep. |
| `💤 can sleep` | No assertion from this session. The Mac follows its normal sleep settings. |

The script ignores `caffeinate` processes that other programs or other Claude Code sessions started.

## Setup

Claude Code does not let plugins set the status line.
Point `statusLine` in `~/.claude/settings.json` at the script in the marketplace checkout.
The path remains the same when the plugin updates.

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/plugins/marketplaces/clankers/plugins/insomniac/scripts/statusline.sh",
    "refreshInterval": 5
  }
}
```

For a local marketplace, use its directory instead of `~/.claude/plugins/marketplaces/clankers`.

`refreshInterval` reruns the script every 5 seconds.
Without it, the status line updates only on events such as a new message, so `☕ awake` can remain after the assertion ends.
Claude Code reruns the script when the model, effort level, or token usage changes, so those segments need no refresh.

## Requirements

- Run on macOS.
  On other systems, Claude Code runs no `caffeinate`, and the script always shows `💤 can sleep`.
- Use `jq`, available as `/usr/bin/jq` on macOS 15 and later.
  Without it, the line shows only the sleep state.

## Limits

- `caffeinate -i` prevents idle sleep but does not keep the display on.
  Closing a laptop lid still puts the Mac to sleep unless it runs in clamshell mode with power and an external display.
- The status line can lag the real state by up to `refreshInterval` seconds because it shows the state from its last run.

## Authors

[dhohner](https://github.com/dhohner)
