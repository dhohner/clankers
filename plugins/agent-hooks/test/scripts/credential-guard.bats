#!/usr/bin/env bats

bats_require_minimum_version 1.5.0

setup() {
  PLUGIN_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  SCRIPT="$PLUGIN_ROOT/scripts/credential-guard.sh"
}

# usage: run_hook <mode> <payload>
run_hook() {
  run --separate-stderr bash -c 'printf "%s" "$1" | bash "$2" "$3"' _ "$2" "$SCRIPT" "$1"
}

assert_continue() {
  [ "$status" -eq 0 ]
  [ "$output" = "" ]
  [ "$stderr" = "" ]
}

assert_blocked() {
  [ "$status" -eq 2 ]
  [ "$output" = "" ]
  [[ "$stderr" == "Command blocked by security policy."* ]]
}

assert_ask() {
  [ "$status" -eq 0 ]
  [[ "$output" == *'"permissionDecision":"ask"'* ]]
  [ "$stderr" = "" ]
}

payload_for_command() {
  jq -nc --arg command "$1" '{tool_name: "Bash", tool_input: {command: $command}}'
}

payload_for_read() {
  jq -nc --arg file_path "$1" '{tool_name: "Read", tool_input: {file_path: $file_path}}'
}

payload_for_grep() {
  jq -nc --arg pattern "$1" --arg path "$2" '{tool_name: "Grep", tool_input: {pattern: $pattern, path: $path}}'
}

payload_for_glob() {
  jq -nc --arg pattern "$1" '{tool_name: "Glob", tool_input: {pattern: $pattern}}'
}

@test "errors without a valid mode argument" {
  run --separate-stderr bash -c 'printf "%s" "$1" | bash "$2"' _ "$(payload_for_command "printenv")" "$SCRIPT"

  [ "$status" -eq 1 ]
  [ "$output" = "" ]
  [[ "$stderr" == *"usage: credential-guard.sh"* ]]
}

@test "warns without blocking when jq is missing" {
  local bindir="$BATS_TEST_TMPDIR/nojq-bin"
  mkdir -p "$bindir"
  ln -s "$(command -v bash)" "$bindir/bash"
  ln -s "$(command -v cat)" "$bindir/cat"

  run --separate-stderr bash -c 'printf "%s" "$1" | PATH="$3" bash "$2" command' _ "$(payload_for_command "printenv")" "$SCRIPT" "$bindir"

  [ "$status" -eq 1 ]
  [ "$output" = "" ]
  [[ "$stderr" == *"jq is not installed"* ]]
}

# Pin each response shape and rule category. The shared fixture accepts either
# deny or ask for protected input.
@test "continues for harmless bash commands" {
  run_hook command "$(payload_for_command "git status --short")"

  assert_continue
}

@test "denies direct environment dumps" {
  run_hook command "$(payload_for_command "printenv")"

  assert_blocked
}

@test "denies interpreter one-liners that dump the environment" {
  run_hook command "$(payload_for_command "node -e 'console.log(process.env)'")"

  assert_blocked
}

@test "denies token commands" {
  run_hook command "$(payload_for_command "gh auth status --show-token")"

  assert_blocked
}

@test "asks for terminal reads of credential files" {
  run_hook command "$(payload_for_command "cat .env")"

  assert_ask
}

@test "asks for terminal reads of private key pem files" {
  run_hook command "$(payload_for_command "cat key.pem")"

  assert_ask
}

@test "asks for Read of an absolute credential path" {
  run_hook path "$(payload_for_read "/Users/someone/.ssh/id_rsa")"

  assert_ask
}

@test "asks for Read of a dotenv file" {
  run_hook path "$(payload_for_read "/Users/someone/project/.env")"

  assert_ask
}

@test "continues for Read of a project file" {
  run_hook path "$(payload_for_read "/Users/someone/project/src/main.ts")"

  assert_continue
}

@test "asks for Grep scoped to a credential path" {
  run_hook path "$(payload_for_grep "aws_access_key_id" "/Users/someone/.aws/credentials")"

  assert_ask
}

@test "continues for Grep content patterns that mention credential names" {
  run_hook path "$(payload_for_grep "os.environ|\\.env" "/Users/someone/project")"

  assert_continue
}

@test "asks for Glob patterns that target private keys" {
  run_hook path "$(payload_for_glob "**/*.pem")"

  assert_ask
}

@test "continues for ordinary Glob patterns" {
  run_hook path "$(payload_for_glob "src/**/*.ts")"

  assert_continue
}

@test "matches the shared blocked-text cases" {
  local failures=0
  local command expected

  while IFS= read -r encoded; do
    command=$(printf '%s' "$encoded" | jq -r '.command')
    expected=$(printf '%s' "$encoded" | jq -r '.blocked')

    run_hook command "$(payload_for_command "$command")"

    if [ "$expected" = "true" ]; then
      if [ "$status" -ne 2 ] && [[ "$output" != *'"permissionDecision":"ask"'* ]]; then
        printf 'expected deny or ask, got status %s: %q\n' "$status" "$command" >&3
        failures=$((failures + 1))
      fi
    elif [ "$status" -ne 0 ] || [ "$output" != "" ]; then
      printf 'expected allowed, got status %s: %q\n' "$status" "$command" >&3
      failures=$((failures + 1))
    fi
  done < <(jq -c '.[]' "$BATS_TEST_DIRNAME/../fixtures/blocked-text-cases.json")

  [ "$failures" -eq 0 ]
}
