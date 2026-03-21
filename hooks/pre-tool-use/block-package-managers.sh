#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""')
COMMAND_CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // .tool_input.cwd // .tool_input.working_directory // ""')

case "$TOOL_NAME" in
  run_in_terminal|runTerminalCommand|Bash)
    COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""')
    ;;
  *)
    exit 0
    ;;
esac

if [ -z "$COMMAND_CWD" ]; then
  COMMAND_CWD=$PWD
fi

has_local_node_binary() {
  local binary dir parent
  binary=$1
  dir=$2

  while [ -n "$dir" ] && [ "$dir" != "." ]; do
    if [ -x "$dir/node_modules/.bin/$binary" ]; then
      return 0
    fi

    if [ "$dir" = "/" ]; then
      break
    fi

    parent=$(dirname "$dir")
    if [ "$parent" = "$dir" ]; then
      break
    fi

    dir=$parent
  done

  return 1
}

is_likely_project_binary() {
  case "$1" in
    astro|ava|babel|biome|cypress|eslint|jest|mocha|next|nx|playwright|prettier|rollup|stylelint|sv|svelte-kit|tailwindcss|ts-node|tsc|tsserver|tsx|turbo|vite|vitest|webpack)
      return 0
      ;;
  esac

  return 1
}

extract_simple_npx_invocation() {
  local remainder
  remainder=${COMMAND#npx}
  remainder=$(printf '%s' "$remainder" | sed -E 's/^[[:space:]]+//')

  if [ -z "$remainder" ]; then
    return 1
  fi

  case "$remainder" in
    -*)
      return 1
      ;;
  esac

  NPX_REMAINDER=$remainder
  NPX_BINARY=${remainder%%[[:space:]]*}

  return 0
}

if printf '%s\n' "$COMMAND" | grep -qE '^npm([[:space:]]|$)'; then
  echo "Blocked: use pnpm instead of npm" >&2
  exit 2
fi

if printf '%s\n' "$COMMAND" | grep -qE '^npx([[:space:]]|$)'; then
  if extract_simple_npx_invocation; then
    if printf '%s\n' "$NPX_BINARY" | grep -q '/'; then
      REPLACEMENT="pnpm dlx $NPX_REMAINDER"
    elif has_local_node_binary "$NPX_BINARY" "$COMMAND_CWD" || is_likely_project_binary "$NPX_BINARY"; then
      REPLACEMENT="pnpm exec $NPX_REMAINDER"
    else
      REPLACEMENT="pnpm dlx $NPX_REMAINDER"
    fi

    echo "Blocked: use $REPLACEMENT instead of $COMMAND" >&2
  else
    echo "Blocked: use pnpm dlx instead of npx" >&2
  fi
  exit 2
fi

exit 0
