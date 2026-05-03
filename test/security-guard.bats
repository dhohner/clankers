#!/usr/bin/env bats

bats_require_minimum_version 1.5.0

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/.." && pwd)"
  SCRIPT="$REPO_ROOT/plugins/security-guard/scripts/block-fups.sh"
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

@test "continues for harmless bash commands" {
  run_hook "$(payload_for_command "git status --short")"

  assert_continue
}

@test "blocks direct environment dumps" {
  run_hook "$(payload_for_command "printenv")"

  assert_blocked
}

@test "blocks environment dumps inside compound commands" {
  run_hook "$(payload_for_command "echo before; env; echo after")"

  assert_blocked
}

@test "blocks shell export dumps" {
  run_hook "$(payload_for_command "export -p")"

  assert_blocked
}

@test "blocks dotenv file reads" {
  run_hook "$(payload_for_command "cat .env.local")"

  assert_blocked
}

@test "allows dotenv examples" {
  run_hook "$(payload_for_command "cat .env.example")"

  assert_continue
}

@test "blocks private key paths" {
  run_hook "$(payload_for_command "cat ~/.ssh/id_ed25519")"

  assert_blocked
}

@test "blocks pem files" {
  run_hook "$(payload_for_command "openssl x509 -in deploy-key.pem -text")"

  assert_blocked
}

@test "blocks common credential files" {
  run_hook "$(payload_for_command "cat ~/.aws/credentials")"

  assert_blocked
}

@test "blocks credential-producing CLIs" {
  run_hook "$(payload_for_command "gh auth token")"

  assert_blocked
}
