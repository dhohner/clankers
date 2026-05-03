#!/usr/bin/env bats

bats_require_minimum_version 1.5.0

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/.." && pwd)"
  SCRIPT="$REPO_ROOT/plugins/block-package-managers/scripts/block-package-managers.sh"
}

run_hook() {
  run --separate-stderr bash -c 'printf "%s" "$1" | bash "$2"' _ "$1" "$SCRIPT"
}

payload_for_command() {
  local command="$1"
  local cwd="${2:-$REPO_ROOT}"

  jq -nc --arg command "$command" --arg cwd "$cwd" '{
    tool_name: "Bash",
    tool_input: {
      command: $command,
      cwd: $cwd
    }
  }'
}

payload_for_tool() {
  local tool_name="$1"
  local command="$2"

  jq -nc --arg tool_name "$tool_name" --arg command "$command" '{
    tool_name: $tool_name,
    tool_input: {
      command: $command
    }
  }'
}

assert_continue() {
  [ "$status" -eq 0 ]
  [ "$output" = "" ]
  [ "$stderr" = "" ]
}

assert_blocked_with() {
  [ "$status" -eq 2 ]
  [ "$output" = "" ]
  [ "$stderr" = "$1" ]
}

@test "ignores non-terminal tools" {
  run_hook "$(payload_for_tool "read" "npm install")"

  assert_continue
}

@test "continues for harmless bash commands" {
  run_hook "$(payload_for_command "pnpm install")"

  assert_continue
}

@test "blocks npm and suggests pnpm equivalent" {
  run_hook "$(payload_for_command "npm install")"

  assert_blocked_with "Blocked: use pnpm install instead of npm install"
}

@test "blocks bare npm" {
  run_hook "$(payload_for_command "npm")"

  assert_blocked_with "Blocked: use pnpm instead of npm"
}

@test "blocks npx project binaries with pnpm exec" {
  tmpdir="$(mktemp -d)"
  mkdir -p "$tmpdir/node_modules/.bin"
  touch "$tmpdir/node_modules/.bin/prettier"
  chmod +x "$tmpdir/node_modules/.bin/prettier"

  run_hook "$(payload_for_command "npx prettier --write ." "$tmpdir")"

  rm -rf "$tmpdir"
  assert_blocked_with "Blocked: use pnpm exec prettier --write . instead of npx prettier --write ."
}

@test "blocks npx one-off package commands with pnpm dlx" {
  run_hook "$(payload_for_command "npx create-vite@latest demo")"

  assert_blocked_with "Blocked: use pnpm dlx create-vite@latest demo instead of npx create-vite@latest demo"
}

@test "blocks unsupported npx forms with generic pnpm dlx guidance" {
  run_hook "$(payload_for_command "npx --yes cowsay hi")"

  assert_blocked_with "Blocked: use pnpm dlx instead of npx"
}

