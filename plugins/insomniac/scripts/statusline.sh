#!/bin/sh
# Claude Code status line showing the model, effort level, context window usage, and
# whether caffeinate keeps the Mac awake, for example:
#   Opus 5 · high · ━━━━━━━╸──────────── 38% 76k/200k                 ☕ awake
# Set this script as statusLine.command. Claude Code sends the session as JSON on stdin.
# Colors follow the terminal theme's standard ANSI colors. Set NO_COLOR to turn them off.
# The script puts the sleep state at the right edge when COLUMNS holds the terminal width.
# Otherwise, it places the sleep state after a separator. Claude Code sets COLUMNS for the
# status line.
#
# On macOS, Claude Code runs `caffeinate -i` as a child while a turn is busy. It kills the
# process about 30 seconds after the turn ends. The script finds a caffeinate child of any
# ancestor. It skips launchd, PID 1. Launchd adopts every detached `caffeinate` process,
# so assertions from other programs do not count.

# Claude Code sends effort only for models that support it. It sends null used_percentage
# until the first response reports token usage. The script drops a segment for a missing
# field.
# The script removes a trailing model note such as "(1M context)" because the token count
# next to the bar shows the window size.
# Each of the 20 bar cells represents 5% of the context window. A half cell represents at
# least 2.5% more.
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

# Claude Code indents the status line by 4 columns.
LINE_MARGIN=4
# The replacement gap must be at least the separator's width.
MIN_GAP=3

sleep_state=$(ps -Ao pid=,ppid=,comm= | awk -v self="$$" '
  {
    parent[$1] = $2
    name = $3
    sub(/.*\//, "", name)
    if (name == "caffeinate") keeps_awake[$2] = 1
  }
  END {
    # Limit traversal to 64 levels to guard against a changing process table.
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

# Each emoji occupies two terminal columns.
if [ "$sleep_state" = awake ]; then
  sleep_segment="☕ $yellow$sleep_state$reset" sleep_width=8
else
  sleep_segment="💤 $dim$sleep_state$reset" sleep_width=12
fi

# The query returns the visible width, a tab, and the colored text.
# Without jq or with invalid JSON, the line shows only the sleep state.
rendered=$(jq -r "$SESSION_DETAILS" 2>/dev/null)
details=${rendered#*	}
details_width=${rendered%%	*}
[ -n "$details" ] || details_width=0

gap=0
case ${COLUMNS:-} in
  '' | *[!0-9]*) ;;
  # Skip arithmetic for COLUMNS values longer than five digits to prevent shell overflow.
  *) [ "${#COLUMNS}" -le 5 ] && gap=$((COLUMNS - LINE_MARGIN - details_width - sleep_width)) ;;
esac

if [ "$gap" -ge "$MIN_GAP" ]; then
  printf "%s%${gap}s%s\n" "$details" '' "$sleep_segment"
else
  printf '%s\n' "${details:+$details$dim · $reset}$sleep_segment"
fi
