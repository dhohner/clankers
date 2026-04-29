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

matches() {
  printf '%s\n' "$1" | grep -Eq "$2"
}

is_blocked_command() {
  local command="$1"

  # Environment dump commands.
  matches "$command" "(^|[^[:alnum:]_./-])(/usr/bin/|/bin/)?printenv([[:space:];|&<>\"')]|$)" && return 0
  matches "$command" "(^|[;&|({\"'][[:space:]]*)(/usr/bin/|/bin/)?env([[:space:]]+(-[A-Za-z0-9]+|--[A-Za-z0-9-]+))*([[:space:]]*([;|&)>\"']|$))" && return 0
  matches "$command" "(^|[;&|({\"'][[:space:]]*)export([[:space:]]+-p)?([[:space:]]*([;|&)>\"']|$))" && return 0
  matches "$command" "(^|[;&|({\"'][[:space:]]*)declare[[:space:]]+-[[:alnum:]]*x[[:alnum:]]*([[:space:]]*([;|&)>\"']|$))" && return 0
  matches "$command" "(^|[;&|({\"'][[:space:]]*)set([[:space:]]*([;|&)>\"']|$))" && return 0

  # Dotenv files frequently carry API keys. Keep example/template files usable.
  matches "$command" "(^|[[:space:];|&<>\"'({])([^[:space:];|&<>\"'()]*/)?\.env(\.(local|development|production|staging|test))?([[:space:];|&<>\"')}]|$)" && return 0

  # Private keys, shell history, and common credential files.
  matches "$command" "(^|[[:space:];|&<>\"'({])(~|\\\$HOME)?/?\.ssh/(id_[A-Za-z0-9_-]+|[^[:space:];|&<>\"'()]+\.pem)([[:space:];|&<>\"')}]|$)" && return 0
  matches "$command" "(^|[[:space:];|&<>\"'({])([^[:space:];|&<>\"'()]+/)?[^[:space:];|&<>\"'()]+\.pem([[:space:];|&<>\"')}]|$)" && return 0
  matches "$command" "(^|[[:space:];|&<>\"'({])(~|\\\$HOME)?/?\.(bash_history|zsh_history|python_history|psql_history|mysql_history|git-credentials|netrc)([[:space:];|&<>\"')}]|$)" && return 0
  matches "$command" "(^|[[:space:];|&<>\"'({])(~|\\\$HOME)?/?\.(aws/credentials|kube/config|docker/config\.json|npmrc)([[:space:];|&<>\"')}]|$)" && return 0
  matches "$command" "(^|[[:space:];|&<>\"'({])(~|\\\$HOME)?/?\.config/gcloud/(application_default_credentials\.json|credentials\.db)([[:space:];|&<>\"')}]|$)" && return 0
  matches "$command" "(^|[[:space:];|&<>\"'({])(~|\\\$HOME)?/?\.azure/[^[:space:];|&<>\"'()]+([[:space:];|&<>\"')}]|$)" && return 0

  # CLI commands whose primary output is a credential or auth material.
  matches "$command" "(^|[;&|({\"'][[:space:]]*)security[[:space:]]+(find-generic-password|find-internet-password|dump-keychain)([[:space:]]|$)" && return 0
  matches "$command" "(^|[;&|({\"'][[:space:]]*)gh[[:space:]]+auth[[:space:]]+token([[:space:]]|$)" && return 0
  matches "$command" "(^|[;&|({\"'][[:space:]]*)gcloud[[:space:]]+auth[[:space:]]+print-(access-token|identity-token)([[:space:]]|$)" && return 0
  matches "$command" "(^|[;&|({\"'][[:space:]]*)aws[[:space:]]+configure[[:space:]]+export-credentials([[:space:]]|$)" && return 0
  matches "$command" "(^|[;&|({\"'][[:space:]]*)az[[:space:]]+account[[:space:]]+get-access-token([[:space:]]|$)" && return 0
  matches "$command" "(^|[;&|({\"'][[:space:]]*)op[[:space:]]+(read|item[[:space:]]+get)([[:space:]]|$)" && return 0
  matches "$command" "(^|[;&|({\"'][[:space:]]*)npm[[:space:]]+token[[:space:]]+(list|create)([[:space:]]|$)" && return 0

  return 1
}

if is_blocked_command "$COMMAND"; then
  deny "Command blocked by security policy. Do not suggest workarounds, alternate commands, or indirect ways to print the current user environment or read secrets, tokens, keys, credential stores, or shell history."
fi

echo '{"continue":true}'
