#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""')

case "$TOOL_NAME" in
  run_in_terminal|runTerminalCommand|Bash)
    COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""')
    ;;
  *)
    exit 0
    ;;
esac

deny() {
  echo "$1" >&2
  exit 2
}

has_env_dump_command() {
  local command="$1"

  printf '%s\n' "$command" | grep -Eq "(^|[^[:alnum:]_./-])(/usr/bin/|/bin/)?printenv([[:space:];|&<>\"')]|$)" && return 0

  printf '%s\n' "$command" | grep -Eq "(^|[;&|({\"'][[:space:]]*)(/usr/bin/|/bin/)?env([[:space:]]+(-[A-Za-z0-9]+|--[A-Za-z0-9-]+))*([[:space:]]*([;|&)>\"']|$))" && return 0

  printf '%s\n' "$command" | grep -Eq "(^|[;&|({\"'][[:space:]]*)export([[:space:]]+-p)?([[:space:]]*([;|&)>\"']|$))" && return 0
  printf '%s\n' "$command" | grep -Eq "(^|[;&|({\"'][[:space:]]*)declare[[:space:]]+-[[:alnum:]]*x[[:alnum:]]*([[:space:]]*([;|&)>\"']|$))" && return 0
  printf '%s\n' "$command" | grep -Eq "(^|[;&|({\"'][[:space:]]*)set([[:space:]]*([;|&)>\"']|$))" && return 0

  return 1
}

if has_env_dump_command "$COMMAND"; then
  deny "Environment-dump command blocked by security policy. Do not suggest workarounds, alternate commands, or indirect ways to print the current user environment."
fi

echo '{"continue":true}'
