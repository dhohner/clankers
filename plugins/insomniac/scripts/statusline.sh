#!/bin/sh
# Claude Code status line that shows the model, effort level, context window usage, and
# whether caffeinate keeps the Mac awake, for example:
#   Opus 5 · high · ━━━━━━━╸──────────── 38% 76k/200k                 ☕ awake
# Usage: set as statusLine.command, which receives the session as JSON on stdin.
# Colors use the terminal theme's standard ANSI colors. Set NO_COLOR to turn them off.
# The sleep state sits at the right edge when COLUMNS gives the terminal width, which
# Claude Code sets for the status line, and after a separator otherwise.
#
# On macOS, Claude Code runs `caffeinate -i` as its own child while a turn is busy and
# kills it about 30 seconds after the turn ends. The script therefore looks for a
# caffeinate child of any of its ancestors. It skips launchd (PID 1), which adopts every
# detached caffeinate, so another program's assertion never counts.

# Claude Code sends effort only for models that support it, and a null used_percentage
# until the first response reports token usage. A missing field drops its segment.
# The model name loses a trailing note such as "(1M context)", because the token count
# next to the bar shows the window size.
# Each of the 20 bar cells stands for 5% of the context window, and a half cell for at
# least 2.5% more. The bar turns yellow at 50% and red at 80%.
SESSION_DETAILS='
def paint($code):
  if . == "" or ($ENV.NO_COLOR // "") != "" then . else "\u001b[\($code)m\(.)\u001b[0m" end;
def repeat($n): if $n > 0 then . * $n else "" end;
def abbreviated:
  if . >= 1000000 then "\(. / 100000 | floor / 10)M"
  elif . >= 1000 then "\(. / 1000 | floor)k"
  else tostring end;
def usage_color: if . >= 80 then "31" elif . >= 50 then "33" else "32" end;
def context_usage:
  .used_percentage as $used
  | if $used == null then ("─" | repeat(20) | paint("2")) + " " + ("--" | paint("2"))
    else ($used / 5 | floor) as $full
      | (if $used % 5 * 2 >= 5 then "╸" else "" end) as $half
      | ($used | usage_color) as $color
      | (("━" | repeat($full)) + $half | paint($color))
        + ("─" | repeat(20 - $full - ($half | length)) | paint("2"))
        + " " + ("\($used)%" | paint($color))
        + " " + ("\(.total_input_tokens // 0 | abbreviated)/\(.context_window_size | abbreviated)" | paint("2"))
    end;
[
  (.model.display_name // .model.id // empty | sub(" \\([^)]*\\)$"; "") | paint("1")),
  (.effort.level // empty | paint("35")),
  (.context_window // empty | context_usage)
] | join(" · " | paint("2"))
| "\(gsub("\u001b\\[[0-9;]*m"; "") | length)\t\(.)"'

# Claude Code indents the status line, which leaves it this many columns short of COLUMNS.
LINE_MARGIN=4
# Right alignment needs at least as much room as the separator it replaces.
MIN_GAP=3

sleep_state=$(ps -Ao pid=,ppid=,comm= | awk -v self="$$" '
  {
    parent[$1] = $2
    name = $3
    sub(/.*\//, "", name)
    if (name == "caffeinate") keeps_awake[$2] = 1
  }
  END {
    # The depth limit guards against a process table that changed while ps read it.
    for (pid = parent[self]; pid > 1 && depth < 64; pid = parent[pid]) {
      if (pid in keeps_awake) {
        print "awake"
        exit
      }
      depth++
    }
    print "can sleep"
  }
')

if [ -n "${NO_COLOR:-}" ]; then
  dim='' yellow='' reset=''
else
  esc=$(printf '\033')
  dim="$esc[2m" yellow="$esc[33m" reset="$esc[0m"
fi

# The emoji take two columns each.
if [ "$sleep_state" = awake ]; then
  sleep_segment="☕ $yellow$sleep_state$reset" sleep_width=8
else
  sleep_segment="💤 $dim$sleep_state$reset" sleep_width=12
fi

# The details arrive as their visible width, a tab, and the colored text.
# Without jq or with invalid JSON the line shows only the sleep state.
rendered=$(jq -r "$SESSION_DETAILS" 2>/dev/null)
details=${rendered#*	}
details_width=${rendered%%	*}
[ -n "$details" ] || details_width=0

gap=0
case ${COLUMNS:-} in
  '' | *[!0-9]*) ;;
  # The length check keeps an absurd width from overflowing shell arithmetic.
  *) [ "${#COLUMNS}" -le 5 ] && gap=$((COLUMNS - LINE_MARGIN - details_width - sleep_width)) ;;
esac

if [ "$gap" -ge "$MIN_GAP" ]; then
  printf "%s%${gap}s%s\n" "$details" '' "$sleep_segment"
else
  printf '%s\n' "${details:+$details$dim · $reset}$sleep_segment"
fi
