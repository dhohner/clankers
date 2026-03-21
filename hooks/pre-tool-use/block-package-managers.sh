#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""')

case "$TOOL_NAME" in
  run_in_terminal|runTerminalCommand|Bash)
    COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""')
    ;;
  *)
    exit 0
    ;;
esac

if printf '%s\n' "$COMMAND" | grep -qE '^npm([[:space:]]|$)'; then
  echo "Blocked: use pnpm instead of npm" >&2
  exit 2
fi

if printf '%s\n' "$COMMAND" | grep -qE '^npx([[:space:]]|$)'; then
  echo "Blocked: use pnpm dlx instead of npx" >&2
  exit 2
fi

exit 0
