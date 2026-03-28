#!/usr/bin/env bash
set -euo pipefail

INPUT="$(cat)"

json_continue() {
  echo '{"continue":true}'
}

json_with_context() {
  local context="$1"
  jq -n \
    --arg context "$context" \
    '{
      continue: true,
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: $context
      }
    }'
}

truncate_output() {
  local content="$1"
  local max_chars=3000

  if [ "${#content}" -le "$max_chars" ]; then
    printf '%s' "$content"
    return
  fi

  printf '%s\n\n[truncated]' "${content:0:max_chars}"
}

is_code_change_tool() {
  case "$1" in
    apply_patch|applyPatch|create_file|createFile|editFiles|replaceStringInFile|writeFile|replace_string_in_file|write_file)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

TOOL_NAME="$(printf '%s' "$INPUT" | jq -r '.tool_name // empty')"
WORKSPACE_CWD="$(printf '%s' "$INPUT" | jq -r '.cwd // empty')"

if ! is_code_change_tool "$TOOL_NAME"; then
  json_continue
  exit 0
fi

if [ -z "$WORKSPACE_CWD" ] || [ ! -d "$WORKSPACE_CWD" ]; then
  json_continue
  exit 0
fi

PACKAGE_JSON="$WORKSPACE_CWD/package.json"
if [ ! -f "$PACKAGE_JSON" ]; then
  json_continue
  exit 0
fi

FORMAT_SCRIPT="$(jq -r '.scripts.format // empty' "$PACKAGE_JSON")"
LINT_SCRIPT="$(jq -r '.scripts.lint // empty' "$PACKAGE_JSON")"

if [ -z "$FORMAT_SCRIPT" ] && [ -z "$LINT_SCRIPT" ]; then
  json_continue
  exit 0
fi

if ! command -v pnpm >/dev/null 2>&1; then
  json_with_context "PostToolUse skipped in $WORKSPACE_CWD because pnpm is not installed."
  exit 0
fi

cd "$WORKSPACE_CWD"

format_failed=false
lint_failed=false
format_output=""
lint_output=""

if [ -n "$FORMAT_SCRIPT" ]; then
  if ! format_output="$(pnpm format 2>&1)"; then
    format_failed=true
  fi
fi

if [ -n "$LINT_SCRIPT" ]; then
  if ! lint_output="$(pnpm lint 2>&1)"; then
    lint_failed=true
  fi
fi

if [ "$format_failed" = false ] && [ "$lint_failed" = false ]; then
  json_continue
  exit 0
fi

context_lines=()
context_lines+=("PostToolUse ran after the code-change tool \"$TOOL_NAME\" in $WORKSPACE_CWD.")

if [ "$format_failed" = true ]; then
  context_lines+=("")
  context_lines+=('`pnpm format` failed:')
  context_lines+=("$(truncate_output "$format_output")")
fi

if [ "$lint_failed" = true ]; then
  context_lines+=("")
  context_lines+=('`pnpm lint` failed:')
  context_lines+=("$(truncate_output "$lint_output")")
fi

json_with_context "$(printf '%s\n' "${context_lines[@]}")"