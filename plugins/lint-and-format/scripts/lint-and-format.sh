#!/usr/bin/env bash
set -euo pipefail

INPUT="$(cat)"
readonly MAX_OUTPUT_CHARS=3000
readonly RELEVANT_FILE_GLOBS=('*.js' '*.jsx' '*.ts' '*.tsx')

continue_and_exit() {
  echo '{"continue":true}'
  exit 0
}

json_with_system_message() {
  local message="$1"
  jq -n \
    --arg message "$message" \
    '{
      continue: true,
      systemMessage: $message
    }'
}

skip_missing_dependency() {
  local dependency="$1"
  if [ "$dependency" = "jq" ]; then
    echo '{"continue":true,"systemMessage":"Lint/format skipped because jq is not installed."}'
    exit 0
  fi

  json_with_system_message "Lint/format skipped in $WORKSPACE_CWD because $dependency is not installed."
  exit 0
}

truncate_output() {
  local content="$1"

  if [ "${#content}" -le "$MAX_OUTPUT_CHARS" ]; then
    printf '%s' "$content"
    return
  fi

  printf '%s\n\n[truncated]' "${content:0:MAX_OUTPUT_CHARS}"
}

git_has_relevant_changes() {
  local repo_root

  if ! repo_root="$(git -C "$WORKSPACE_CWD" rev-parse --show-toplevel 2>/dev/null)"; then
    return 0
  fi

  [ -n "$(git -C "$repo_root" status --short --untracked-files=all -- "${RELEVANT_FILE_GLOBS[@]}" 2>/dev/null)" ]
}

if ! command -v jq >/dev/null 2>&1; then
  WORKSPACE_CWD="the current workspace"
  skip_missing_dependency "jq"
fi

WORKSPACE_CWD="$(printf '%s' "$INPUT" | jq -r '.cwd // empty')"

if [ -z "$WORKSPACE_CWD" ] || [ ! -d "$WORKSPACE_CWD" ]; then
  continue_and_exit
fi

PACKAGE_JSON="$WORKSPACE_CWD/package.json"
if [ ! -f "$PACKAGE_JSON" ]; then
  continue_and_exit
fi

FORMAT_SCRIPT="$(jq -r '.scripts.format // empty' "$PACKAGE_JSON")"
LINT_SCRIPT="$(jq -r '.scripts.lint // empty' "$PACKAGE_JSON")"

if [ -z "$FORMAT_SCRIPT" ] && [ -z "$LINT_SCRIPT" ]; then
  continue_and_exit
fi

if ! command -v git >/dev/null 2>&1; then
  skip_missing_dependency "git"
fi

if ! git_has_relevant_changes; then
  continue_and_exit
fi

if ! command -v pnpm >/dev/null 2>&1; then
  skip_missing_dependency "pnpm"
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
  continue_and_exit
fi

context_lines=()
context_lines+=("Stop ran at the end of the agent response in $WORKSPACE_CWD.")

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

json_with_system_message "$(printf '%s\n' "${context_lines[@]}")"
