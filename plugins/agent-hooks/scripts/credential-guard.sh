#!/usr/bin/env bash
# PreToolUse guard. Denies environment and credential dumps, asks before a tool
# reads a credential file or sweeps the home directory, and continues otherwise.
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

LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib"
source "$LIB/shell-text.sh"
source "$LIB/deny-rules.sh"
source "$LIB/path-rules.sh"

ASK_REASON=''

deny_command() {
  echo "Command blocked by security policy. Do not suggest workarounds, alternate commands, or indirect ways to print the current user environment or read secrets, tokens, keys, credential stores, or shell history." >&2
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

# The first matched rule names the ask reason.
record_ask() {
  [ -n "$ASK_REASON" ] || ASK_REASON="$1"
}

check_segment() {
  local segment word rest class token
  normalize_segment "$1"
  segment="$NORMALIZED"
  [ -n "$segment" ] || return 0

  if [[ "$segment" =~ $SHELL_C_BARE ]]; then
    check_segment "$(strip_quotes "${BASH_REMATCH[3]}")"
    return 0
  fi

  word="${segment%%[[:space:]]*}"
  rest="${segment#"$word"}"
  rest="${rest#"${rest%%[![:space:]]*}"}"
  if [ "$word" = eval ]; then
    check_segment "$(strip_quotes "$rest")"
    return 0
  fi

  is_denied_command "$word" "$rest" && deny_command

  verb_class "$word" "$rest"
  class="$CLASS"
  [ "$class" != metadata ] || return 0
  [[ "$rest" =~ $PATH_HINT ]] || return 0
  while IFS= read -r token; do
    check_operand "$class" "$word" "$token"
  done < <(operand_tokens "$class" "$rest")
}

check_command_text() {
  local text segment
  is_allowed_env_command "$1" && return 0
  text=$(printf '%s\n' "$1" | strip_data_heredocs)
  text=$(inline_nested_shells "$text")
  while IFS= read -r segment; do
    check_segment "$segment"
  done < <(split_segments "$text")
}

check_tool_paths() {
  local tool="$1" file_path path glob pattern
  file_path=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""')
  path=$(printf '%s' "$INPUT" | jq -r '.tool_input.path // ""')
  glob=$(printf '%s' "$INPUT" | jq -r '.tool_input.glob // ""')
  pattern=$(printf '%s' "$INPUT" | jq -r '.tool_input.pattern // ""')

  case "$tool" in
    Read)
      [ -z "$file_path" ] || check_operand reader Read "$file_path"
      ;;
    Grep)
      # Grep patterns search file contents, so only the path and glob are inspected.
      [ -z "$path" ] || check_operand search Grep "$path"
      [ -z "$glob" ] || check_operand enumerate Grep "$glob"
      ;;
    Glob)
      [ -z "$path" ] || check_operand enumerate Glob "$path"
      [ -z "$pattern" ] || check_operand enumerate Glob "$pattern"
      ;;
    *)
      [ -z "$file_path" ] || check_operand reader "$tool" "$file_path"
      [ -z "$path" ] || check_operand reader "$tool" "$path"
      ;;
  esac
}

if [ "$MODE" = command ]; then
  check_command_text "$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""')"
else
  check_tool_paths "$(printf '%s' "$INPUT" | jq -r '.tool_name // ""')"
fi

if [ -n "$ASK_REASON" ]; then
  ask "$ASK_REASON. Approve only if the agent should access it."
fi
