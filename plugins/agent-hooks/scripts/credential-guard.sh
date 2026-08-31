#!/usr/bin/env bash
set -euo pipefail

# The hooks.json matchers select the mode: terminal tools pass "command" and
# get every rule, file tools pass "path" and get only credential-path rules.
MODE="${1:-}"
if [ "$MODE" != command ] && [ "$MODE" != path ]; then
  echo "agent-hooks: usage: credential-guard.sh command|path" >&2
  exit 1
fi

INPUT=$(cat)

if ! command -v jq >/dev/null 2>&1; then
  echo "agent-hooks: jq is not installed, so the credential guard cannot inspect tool calls." >&2
  exit 1
fi

if [ "$MODE" = command ]; then
  TEXT=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""')
else
  # Grep patterns search file contents, so only Glob patterns count as paths.
  # Source searches such as "process.env" continue.
  TEXT=$(printf '%s' "$INPUT" | jq -r '[
      .tool_input.file_path,
      .tool_input.path,
      (if .tool_name == "Glob" then .tool_input.pattern else .tool_input.glob end)
    ] | map(select(. != null)) | join("\n")')
fi

# LEAD and TRAIL match a shell delimiter or string edge. DIR matches relative
# and absolute directory prefixes. CMD_LEAD matches command position.
readonly LEAD="(^|[[:space:];|&<>\"'({])"
readonly TRAIL="([[:space:];|&<>\"')}]|$)"
readonly DIR="([^[:space:];|&<>\"'()]*/)?"
readonly CMD_LEAD="(^|[;&|({\"'][[:space:]]*)"

deny() {
  echo "$1" >&2
  exit 2
}

ask() {
  jq -nc --arg reason "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

matches() {
  printf '%s\n' "$1" | grep -Eq "$2"
}

is_allowed_env_command() {
  local command="$1"

  [[ "$command" != *$'\n'* && "$command" != *$'\r'* ]] || return 1
  matches "$command" "^[[:blank:]]*env[[:blank:]]*\\|[[:blank:]]*grep[[:blank:]]+('\^PI_'|\"\^PI_\")[[:blank:]]*\\|[[:blank:]]*sort[[:blank:]]*$"
}

# Every .pem path is blocked unless its final component is a conventional public
# certificate name. Delimiters are doubled before extraction so that adjacent
# paths sharing one delimiter are each extracted, since grep -o consumes the
# boundary characters it matched.
is_blocked_pem_path() {
  local command="$1" match component
  local leading_delimiter='[[:space:];|&<>"'"'"'({]'
  local trailing_delimiter='[[:space:];|&<>"'"'"')}]'

  while IFS= read -r match; do
    [ -n "$match" ] || continue
    component="${match#$leading_delimiter}"
    component="${component%$trailing_delimiter}"
    component="${component##*/}"
    case "$component" in
      cert.pem|fullchain.pem|chain.pem|ca.pem|cacert.pem|*-cert.pem) ;;
      *) return 0 ;;
    esac
  done < <(printf '%s\n' "$command" \
    | sed -E "s/([[:space:];|&<>\"'(){}])/\1\1/g" \
    | grep -Eo "(^|[[:space:];|&<>\"'({])([^[:space:];|&<>\"'()]+/)?[^[:space:];|&<>\"'()/]+\.pem([[:space:];|&<>\"')}]|$)" || true)

  return 1
}

# Deny commands whose primary output is the environment or a credential.
is_denied_command() {
  local command="$1"

  is_allowed_env_command "$command" && return 1

  # Environment dump commands.
  matches "$command" "(^|[^[:alnum:]_./-])(/usr/bin/|/bin/)?printenv([[:space:];|&<>\"')]|$)" && return 0
  matches "$command" "${CMD_LEAD}(/usr/bin/|/bin/)?env([[:space:]]+(-[A-Za-z0-9]+|--[A-Za-z0-9-]+))*([[:space:]]*([;|&)>\"']|$))" && return 0
  matches "$command" "${CMD_LEAD}export([[:space:]]+-p)?([[:space:]]*([;|&)>\"']|$))" && return 0
  matches "$command" "${CMD_LEAD}declare[[:space:]]+-[[:alnum:]]*x[[:alnum:]]*([[:space:]]*([;|&)>\"']|$))" && return 0
  matches "$command" "${CMD_LEAD}set([[:space:]]*([;|&)>\"']|$))" && return 0

  # Interpreter one-liners that print the process environment.
  matches "$command" "${CMD_LEAD}(node|bun)[[:space:]][^;&|]*(-e|--eval|-p|--print)[[:space:]=].*process\.env" && return 0
  matches "$command" "${CMD_LEAD}python[0-9.]*[[:space:]][^;&|]*-c[[:space:]=].*os\.environ" && return 0

  # CLI commands whose primary output is a credential or auth material.
  matches "$command" "${CMD_LEAD}security[[:space:]]+(find-generic-password|find-internet-password|dump-keychain)([[:space:]]|$)" && return 0
  matches "$command" "${CMD_LEAD}gh[[:space:]]+auth[[:space:]]+token([[:space:]]|$)" && return 0
  matches "$command" "${CMD_LEAD}gh[[:space:]]+auth[[:space:]]+status[^;&|]*[[:space:]](-t|--show-token)([[:space:]]|$)" && return 0
  matches "$command" "${CMD_LEAD}gcloud[[:space:]]+auth[[:space:]]+print-(access-token|identity-token)([[:space:]]|$)" && return 0
  matches "$command" "${CMD_LEAD}aws[[:space:]]+configure[[:space:]]+export-credentials([[:space:]]|$)" && return 0
  matches "$command" "${CMD_LEAD}az[[:space:]]+account[[:space:]]+get-access-token([[:space:]]|$)" && return 0
  matches "$command" "${CMD_LEAD}op[[:space:]]+(read|item[[:space:]]+get)([[:space:]]|$)" && return 0
  matches "$command" "${CMD_LEAD}npm[[:space:]]+token[[:space:]]+(list|create)([[:space:]]|$)" && return 0

  return 1
}

# Ask for approval when a tool references a common credential file.
is_credential_path_reference() {
  local text="$1"

  # Dotenv files frequently carry API keys. Keep example/template files usable.
  matches "$text" "${LEAD}${DIR}\.env(\.(local|development|production|staging|test))?${TRAIL}" && return 0

  # Private keys, shell history, and common credential files.
  matches "$text" "${LEAD}${DIR}\.ssh/(id_[A-Za-z0-9_-]+|[^[:space:];|&<>\"'()]+\.pem)${TRAIL}" && return 0
  is_blocked_pem_path "$text" && return 0
  matches "$text" "${LEAD}${DIR}\.(bash_history|zsh_history|python_history|psql_history|mysql_history|git-credentials|netrc|pypirc)${TRAIL}" && return 0
  matches "$text" "${LEAD}${DIR}\.(aws/credentials|kube/config|docker/config\.json|npmrc)${TRAIL}" && return 0
  matches "$text" "${LEAD}${DIR}\.config/gcloud/(application_default_credentials\.json|credentials\.db)${TRAIL}" && return 0
  matches "$text" "${LEAD}${DIR}\.config/gh/hosts\.yml${TRAIL}" && return 0
  matches "$text" "${LEAD}${DIR}\.azure/[^[:space:];|&<>\"'()]+${TRAIL}" && return 0
  matches "$text" "${LEAD}${DIR}\.terraform\.d/credentials\.tfrc\.json${TRAIL}" && return 0
  matches "$text" "${LEAD}/proc/[^[:space:];|&<>\"'()/]+/environ${TRAIL}" && return 0

  return 1
}

if [ "$MODE" = command ] && is_denied_command "$TEXT"; then
  deny "Command blocked by security policy. Do not suggest workarounds, alternate commands, or indirect ways to print the current user environment or read secrets, tokens, keys, credential stores, or shell history."
fi

if [ -n "$TEXT" ] && is_credential_path_reference "$TEXT"; then
  ask "This tool call references a common credential file. Approve only if the agent should access its contents."
fi
