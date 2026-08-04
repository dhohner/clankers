#!/usr/bin/env bats

bats_require_minimum_version 1.5.0

setup() {
  PLUGIN_ROOT="$(cd "$BATS_TEST_DIRNAME/.." && pwd)"
  SCRIPT="$PLUGIN_ROOT/scripts/block-fups.sh"
}

run_hook() {
  run --separate-stderr bash -c 'printf "%s" "$1" | bash "$2"' _ "$1" "$SCRIPT"
}

assert_continue() {
  [ "$status" -eq 0 ]
  [ "$output" = '{"continue":true}' ]
  [ "$stderr" = "" ]
}

assert_blocked() {
  [ "$status" -eq 2 ]
  [ "$output" = "" ]
  [[ "$stderr" == "Command blocked by security policy."* ]]
}

payload_for_command() {
  payload_for_tool "Bash" "$1"
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

@test "ignores non-terminal tools" {
  run_hook "$(payload_for_tool "read" "printenv")"

  [ "$status" -eq 0 ]
  [ "$output" = "" ]
  [ "$stderr" = "" ]
}

# The shared-fixture test below asserts only exit status; these two pin the response shape.
@test "continues for harmless bash commands" {
  run_hook "$(payload_for_command "git status --short")"

  assert_continue
}

@test "blocks direct environment dumps" {
  run_hook "$(payload_for_command "printenv")"

  assert_blocked
}

# Shared with test/policy.test.ts so the TypeScript policy and scripts/block-fups.sh,
# which reimplement the same patterns for different hosts, cannot drift apart unnoticed.
@test "matches the shared blocked-text cases" {
  local failures=0
  local command expected

  while IFS= read -r encoded; do
    command=$(printf '%s' "$encoded" | jq -r '.command')
    expected=$(printf '%s' "$encoded" | jq -r '.blocked')

    run_hook "$(payload_for_command "$command")"

    if [ "$expected" = "true" ] && [ "$status" -ne 2 ]; then
      printf 'expected blocked, got status %s: %q\n' "$status" "$command" >&3
      failures=$((failures + 1))
    elif [ "$expected" = "false" ] && [ "$status" -ne 0 ]; then
      printf 'expected allowed, got status %s: %q\n' "$status" "$command" >&3
      failures=$((failures + 1))
    fi
  done < <(jq -c '.[]' "$BATS_TEST_DIRNAME/fixtures/blocked-text-cases.json")

  [ "$failures" -eq 0 ]
}

