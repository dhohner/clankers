# Insomniac plugin

## Pi footer

The plugin supports Pi 1.4.0.

### Install Pi

Install only this plugin from a repository checkout:

```sh
pi install /absolute/path/to/clankers/plugins/insomniac
```

Pi records this installation in `~/.pi/agent/settings.json`, making it available across working directories.
Pi loads the local source directly; keep the checkout at that path.
No Homebrew package files change, and unrelated Pi packages and settings remain in place.
Installing the plugin directory installs only Insomniac; installing the repository root also installs other plugins.
Restart Pi, or run `/reload` in an existing TUI session, to load it automatically.

### Notification preference

Notifications default to enabled when no preference has been saved.
Notification labels can expose the project folder name and optional session name.
In macOS interactive TUI sessions, an enabled run that lasts at least 30 seconds submits one standard desktop notification after final settlement.
Exactly 30 seconds qualifies; shorter runs and cancelled runs produce no notice.
Timing includes waiting, retries, recovery, compaction, and queued continuations from the first start.
The effective preference at settlement applies, including a successful change during a run.
Print, JSON, RPC, Linux, and Windows sessions submit no desktop requests.

The title is `Pi run ended`.
The body contains only the project folder name and, when present, the session name, separated by ` · `.
Control characters are removed or rendered as spaces.
The notice describes settlement and makes no claim that the task succeeded.
It excludes full paths, prompts, responses, tool output, and error details.

Insomniac discovers an executable for each qualifying run, in this order:

1. `terminal-notifier` in the first absolute `PATH` directory containing an executable file of that name.
   Empty and relative `PATH` entries are ignored.
   Standard `terminal-notifier` uses its own app icon.
2. macOS `/usr/bin/osascript`, which requires no optional installation.
   This fallback lacks Pi’s logo and custom activation.

Discovery checks executable files without posting a probe notification and has a one second deadline.
Submission has a ten second process timeout and a 16 KiB output limit.
A missing optional tool is normal: successful fallback submission produces no warning.
A selected tool that fails, times out, or disappears does not trigger another transport attempt for that run.
The next qualifying run discovers tools again.
The notifier uses the `terminal-notifier` argument contract: `-title` and `-message`, with each display value prefixed by one backslash that the notifier removes after parsing.
This keeps option syntax, property list syntax, quotes, and leading backslashes inert.
The fallback passes labels as arguments to a fixed script.

To install the standard notifier explicitly, you can run:

```sh
brew install terminal-notifier
```

Installation is optional.
Insomniac never downloads, installs, or modifies apps, resets permissions, or changes settings automatically.
It requests no sound and applies no foreground app gate.
With `terminal-notifier`, clicking a notice requests activation of the originating app when its bundle identifier is known.
For fallback notices and notices without a target, return to the terminal manually to inspect the result.
macOS controls permission, presentation, click behavior, and dismissal; Insomniac does not change those settings.
A successful process exit confirms submission only.
A submitted request does not guarantee visible presentation: permission settings, Focus, or other macOS suppression may hide it without reporting an error.
Detectable submission failures produce at most one terminal warning per session, with no automatic retry for that run.
Later qualifying runs can attempt submission again.
Sleep protection releases at settlement without waiting for discovery or delivery.
Reload, shutdown, and session replacement discard pending application dispatch; accepted requests belong to macOS and cannot be retracted by Insomniac.
Delivery history remains in memory and is never replayed after restart.

Use these commands in Pi:

```text
/insomniac-notifications
/insomniac-notifications status
/insomniac-notifications disable
/insomniac-notifications enable
```

The first two commands report the current session's effective setting without writing a preference.
The output reports whether notifications are enabled or disabled for this session.
Enable and disable assign a value, so repeating either command keeps the same setting.
A successful save changes this session before its next settlement and persists for future sessions.
Other running sessions keep their own values until they restart or change the setting themselves.
Commands within a session finish in invocation order.
A failed save reports an error and retains the previous effective and saved values.
An error after the saved file has been replaced reports a separate warning; the assignment remains committed.

The preference is a JSON boolean in `<agent-dir>/insomniac-notifications.json`.
Pi resolves `<agent-dir>` through `getAgentDir()`, normally `~/.pi/agent`.
`PI_CODING_AGENT_DIR` selects an isolated directory for both reads and writes.
The working directory and project trust do not select an override.
Pi's `settings.json` is separate from this file.
New preference files use permissions `0600`; replacement preserves the existing owner, group, and permission bits.
If ownership cannot be preserved, the save fails without replacing the saved file.
On macOS, a save or startup reset fails without replacing the saved file if the existing file or temporary replacement has an ACL.
Insomniac checks ACLs with `/bin/ls` because Node's filesystem API cannot preserve them during replacement.
If that inspection fails, the save also fails without replacing the saved file.
Concurrent processes replace the complete value atomically, and the last successful replacement supplies the next session's value.

If the file cannot be read, contains malformed JSON, or contains a value other than a boolean, Insomniac reports the error, disables notifications for the session, and resets the file to `false`.
If resetting fails, it reports that error too and keeps this session disabled.
After fixing the filesystem problem, an explicit enable or disable command can save again.

For an isolated check, launch Pi from a scratch directory with `PI_CODING_AGENT_DIR` set to a temporary directory and this extension loaded.
Run status, disable, and enable using the commands above; restart against the same directory after each assignment to check persistence.
Use synthetic folder and session names such as `demo-project` and `Demo review` when inspecting output.
No personal configuration file needs to be opened.

### Source app activation

At each Pi extension session start, Insomniac snapshots the source app from the Pi process environment.
It maps `TERM_PROGRAM=ghostty` to `com.mitchellh.ghostty`, `iTerm.app` to `com.googlecode.iterm2`, and `Apple_Terminal` to `com.apple.Terminal`.
Other apps can supply their bundle identifier through `__CFBundleIdentifier` in the originating process environment.
Unknown, malformed, or conflicting identity produces a notice without custom activation.
Insomniac never reads the current foreground app.
Later foreground changes, environment changes, deferred discovery, and other Pi sessions cannot retarget an accepted notice.
A replacement extension session resolves its own target.

The mappings follow [Ghostty's environment contract](https://github.com/ghostty-org/ghostty/blob/main/src/termio/Exec.zig), [iTerm2's environment contract](https://github.com/gnachman/iTerm2/blob/master/sources/PTYSession/PTYSession.m), and [iTerm2's bundle metadata](https://github.com/gnachman/iTerm2/blob/master/plists/release-iTerm2.plist).
Ghostty and Terminal bundle identifiers and Terminal's `Apple_Terminal` identity were also checked against installed macOS apps.
Inherited environment values are evidence, but cannot guarantee origin after forwarding or unusual shell setup.
Insomniac omits automatic activation when SSH, tmux, or screen environment markers are present.
Use an explicit override for multiplexers, remote shells, or an unknown source only when that app exists on the Mac submitting the notice.
Remote app activation is unsupported.

Set the override in the shell that launches Pi:

```sh
export INSOMNIAC_SOURCE_APP=com.mitchellh.ghostty
printf '%s\n' "$INSOMNIAC_SOURCE_APP"
pi
```

Replace the example with the intended app's bundle identifier.
For an installed app, read its `CFBundleIdentifier` from its `Contents/Info.plist`, for example:

```sh
/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' /Applications/Ghostty.app/Contents/Info.plist
```

The explicit value takes precedence over all automatic identity, including SSH and multiplexer markers.
Values allow ASCII letters, digits, hyphens, and periods, following [Apple's bundle identifier character rules](https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundleidentifier).
Single components, numeric components, mixed case, and internal hyphens are accepted.
Empty components, leading hyphens, whitespace, controls, non-ASCII characters, and shell syntax are rejected.
A present invalid value, including an empty string, disables custom activation without suppressing the notice or selecting another app.
The setting is separate from `/insomniac-notifications` and the persisted JSON boolean preference.

Remove the override to restore automatic detection, then launch a new Pi process from that shell:

```sh
unset INSOMNIAC_SOURCE_APP
printf '%s\n' "${INSOMNIAC_SOURCE_APP-unset}"
pi
```

An existing process cannot inherit later changes from its parent shell.
To verify the setting, use a scratch project, synthetic session labels, a temporary `PI_CODING_AGENT_DIR`, and an already installed native notifier with provider networking disabled.
Confirm the printed value and the app's bundle identifier, run an eligible TUI session for at least 30 seconds, switch to another app, then click the notice and observe which app comes forward.
Repeat after removing the override to check detection.
Record the notifier version, source app, override value or absence, notification permission state, and observed activation.
A successful submission or an argument test does not verify that macOS displayed the notice or activated an app.

`terminal-notifier` uses [`-activate BUNDLE_ID`](https://github.com/julienXX/terminal-notifier/blob/3.1.0/README.markdown#-activate-bundle_id).
The bundle identifier is an inert argument; Insomniac never builds a shell click command or uses `-execute`.
Activation brings the app forward and does not select a window, tab, project, or Pi session.
Clicking never starts or repeats Pi work.
The `osascript` fallback always keeps normal macOS click behavior, even with an override.
Notification permissions belong to the selected sender, either `terminal-notifier` or the fallback host.
Check that sender's permission in macOS settings if a notice is missing; Insomniac does not change permissions, request accessibility access, or automate terminal contents.

### Footer output

The footer shows the model name (or identifier), thinking level for reasoning models, current context usage, and estimated session cost from Pi.
When Output Styles is active, its style appears on the right after the sleep state, for example `💤 can sleep · [unslop]` or `☕ awake · [unslop]`.
The style name uses the current theme's accent color.
Insomniac reads the shared `output-style` status entry and omits it from the additional status rows.
The built-in `default` style has no entry and adds no brackets.
The dim `~$0.123` segment follows the context meter and uses USD with three decimal places.
It sums recorded costs across the entire session, including other conversation branches, tool usage, compaction, branch summaries, and cache warming.
The estimate starts at `~$0.000`, survives compaction and reload, and shows `~$--` if recorded costs are invalid.
Actual charges depend on provider pricing and subscriptions.

```text
Opus 5 · high · ━━━━━━━╸──────────── 76k/200k · ~$0.123                 ☕ awake
```
Its 20 cells represent 5% each, with a half cell for at least 2.5% more.
The Pi bar changes color as context grows:

| Context used | Color | Guidance |
| --- | --- | --- |
| Below 25% | Green | Plenty of context remains. |
| 25% to below 50% | Yellow | Context is accumulating. |
| 50% to below 75% | Orange | Plan a compaction or a new session. |
| 75% and above | Red | Consider `/compact`, or `/new` for a fresh task. |

These thresholds provide visual guidance and do not guarantee model quality.
Usage estimates only the current context and excludes cumulative session token totals.
Unknown usage shows `──────────────────── --`, including immediately after compaction.
The footer refreshes when the model, thinking level, or branch changes, and after responses or compaction.
Directory, Git branch, session name, and other extension statuses appear on additional rows as needed.
Narrow terminals truncate individual segments to terminal column widths.
`NO_COLOR=1` disables color escapes.
Green, yellow, and red use the terminal's standard ANSI palette.
Orange uses index 208 from the 256 color palette.

### Sleep ownership

In macOS interactive TUI sessions, Insomniac starts one owned `caffeinate -i -w <Pi PID>` process when active work begins.
`☕ awake` appears after that process starts.
The idle-sleep assertion remains through retries, recovery, compaction, and automatic or queued continuations; a turn ending alone does not release it.
When all work finishes, including after a completed abort, Insomniac releases the assertion and immediately shows `💤 can sleep`.
Requesting an abort keeps the assertion until the work stops.
Reload, footer disposal, and session shutdown also release the owned process.
The `-w` option ties its lifetime to Pi, including forced Pi process exit.
This prevents idle sleep only: it does not keep the display on or override lid-close sleep.

Ownership is in memory and belongs only to this extension session.
Concurrent Pi sessions own separate processes.
The footer neither inspects nor terminates assertions from other Pi sessions, Claude Code, or other applications.
`💤 can sleep` means this session owns no assertion; another application may still keep the Mac awake.

If the executable is missing, process creation fails, or the assertion process unexpectedly exits, Pi remains usable and the footer shows `💤 can sleep`.
Insomniac avoids a restart loop during that run and attempts acquisition again when a new run begins.
Changes request a footer render immediately.
Outside macOS, TUI sessions keep the idle label and start no sleep process.
Print, JSON, and RPC modes do not install the footer or start sleep processes.

### Footer replacement

Pi has one custom footer slot.
Another extension calling `setFooter` can replace Insomniac, and Insomniac can replace another custom footer during startup.
Disable the competing footer to choose one.
Statuses published by other extensions through `setStatus` remain visible.

### Removal

Remove it with the same absolute path, then `/reload` or restart to release this session's assertion and restore Pi's normal footer (unless another extension supplies a custom footer):

```sh
pi remove /absolute/path/to/clankers/plugins/insomniac
```

### Isolated checks

For isolated checks, set `PI_CODING_AGENT_DIR` to a temporary directory before installation and launch Pi from a scratch directory.
This leaves your personal settings untouched.

## Claude Code status line

The plugin shows the model, effort level, context window usage, and whether `caffeinate` keeps the Mac awake.

```text
Opus 5 · high · ━━━━━━━╸──────────── 38% 76k/200k                 ☕ awake
```

### Segments

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

The script uses the width in `COLUMNS` to align the sleep state on the right.
It stops 4 columns short to leave room for Claude Code's indent.
If the terminal is too narrow or `COLUMNS` is missing, the sleep state follows the other segments after a ` · ` separator.

### Sleep state

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

### Setup

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

### Requirements

- Run on macOS.
  On other systems, Claude Code runs no `caffeinate`, and the script always shows `💤 can sleep`.
- Use `jq`, available as `/usr/bin/jq` on macOS 15 and later.
  Without it, the line shows only the sleep state.

### Limits

- `caffeinate -i` prevents idle sleep but does not keep the display on.
  Closing a laptop lid still puts the Mac to sleep unless it runs in clamshell mode with power and an external display.
- The status line can lag the real state by up to `refreshInterval` seconds because it shows the state from its last run.

## Development

`index.ts` exports the Pi extension factory and installation functions.
`src/pi/extension.ts` manages the session lifecycle and connects the footer to the sleep assertion.
`src/pi/footer.ts` installs the component and collects current session data.
`src/pi/render-footer.ts`, `session-cost.ts`, and `sleep-assertion.ts` handle rendering, cost estimation, and process ownership.
`scripts/statusline.sh` renders Claude Code status and observes its existing sleep assertion.

Tests follow the host boundaries in `test/pi/` and `test/claude/`.
`test/integration/` checks real child termination and loading through Pi's extension runner.
Shared simulated hosts and process fixtures live in `test/support/`.
Process tests compile fake executables with `cc` and create no power assertions.
The complete suite requires macOS because Claude Code tests rely on launchd adopting orphaned processes.

From the repository root:

```sh
pnpm --dir plugins/insomniac check
```

### Lint rules

Apply spacing fixes before formatting:

```sh
pnpm --dir plugins/insomniac lint:fix
pnpm --dir plugins/insomniac format
pnpm --dir plugins/insomniac check
```

Prefer concrete types and checked test seams.
Necessary assertions require a nearby `SAFETY:` comment explaining the invariant that permits them.

## Authors

[dhohner](https://github.com/dhohner)
