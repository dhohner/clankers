#!/usr/bin/env bats

bats_require_minimum_version 1.5.0

setup() {
  PLUGIN_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  SCRIPT="$PLUGIN_ROOT/scripts/credential-guard.sh"
  FIXTURES="$BATS_TEST_DIRNAME/../fixtures"
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

assert_ask_reason() {
  assert_ask
  [[ "$output" == *"$1"* ]]
}

# Prints deny, ask, or pass for the last run_hook call.
observed_decision() {
  if [ "$status" -eq 2 ]; then
    echo deny
  elif [[ "$output" == *'"permissionDecision":"ask"'* ]]; then
    echo ask
  elif [ "$status" -eq 0 ] && [ "$output" = "" ]; then
    echo pass
  else
    echo "error($status)"
  fi
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

# Pin each response shape and rule category. The shared fixtures pin the exact
# decision for every case.
@test "continues for harmless bash commands" {
  run_hook command "$(payload_for_command "git status --short")"

  assert_continue
}

@test "denies direct environment dumps" {
  run_hook command "$(payload_for_command "printenv")"

  assert_blocked
}

@test "denies environment dumps behind wrapper commands" {
  run_hook command "$(payload_for_command "sudo env")"

  assert_blocked
}

@test "denies environment dumps inside nested shell strings" {
  run_hook command "$(payload_for_command "bash -c 'echo a; env'")"

  assert_blocked
}

@test "continues for denied words inside quoted arguments" {
  run_hook command "$(payload_for_command "git commit -m \"feat: block printenv and env dumps\"")"

  assert_continue
}

@test "denies interpreter one-liners that dump the environment" {
  run_hook command "$(payload_for_command "node -e 'console.log(process.env)'")"

  assert_blocked
}

@test "continues for interpreter one-liners that read one variable" {
  run_hook command "$(payload_for_command "node -e 'console.log(process.env.HOME)'")"

  assert_continue
}

@test "denies token commands" {
  run_hook command "$(payload_for_command "gh auth status --show-token")"

  assert_blocked
}

@test "asks for terminal reads of credential files with the matched path" {
  run_hook command "$(payload_for_command "cat .env")"

  assert_ask_reason "dotenv file: cat reads .env"
}

@test "asks for terminal reads of private key pem files" {
  run_hook command "$(payload_for_command "cat key.pem")"

  assert_ask_reason "private key: cat reads key.pem"
}

@test "continues for private key generation" {
  run_hook command "$(payload_for_command "openssl req -x509 -newkey rsa:2048 -nodes -keyout /tmp/t/key.pem -out /tmp/t/cert.pem")"

  assert_continue
}

@test "continues for metadata verbs on private keys" {
  run_hook command "$(payload_for_command "rm -f /tmp/t/key.pem")"

  assert_continue
}

@test "continues for heredoc bodies written through cat" {
  run_hook command "$(payload_for_command $'cat > setup.ts <<EOF\njoin(dir, "key.pem")\nEOF')"

  assert_continue
}

@test "asks for heredoc bodies executed by a shell" {
  run_hook command "$(payload_for_command $'bash <<EOF\ncat key.pem\nEOF')"

  assert_ask
}

@test "asks for searches rooted at the home directory" {
  run_hook command "$(payload_for_command "grep -rn JIRA_PAT ~")"

  assert_ask_reason "credential sweep: grep searches under ~"
}

@test "asks for shell rc file reads" {
  run_hook command "$(payload_for_command "cat ~/.zshrc")"

  assert_ask_reason "shell rc file: cat reads ~/.zshrc"
}

@test "asks for Read of an absolute credential path" {
  run_hook path "$(payload_for_read "/Users/someone/.ssh/id_rsa")"

  assert_ask_reason "private key: Read reads /Users/someone/.ssh/id_rsa"
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

@test "asks for Grep rooted at the home directory" {
  run_hook path "$(payload_for_grep "token" "/Users/someone")"

  assert_ask_reason "credential sweep: Grep searches under /Users/someone"
}

@test "continues for Glob patterns that enumerate project private keys" {
  run_hook path "$(payload_for_glob "**/*.pem")"

  assert_continue
}

@test "asks for Glob patterns rooted at the home directory" {
  run_hook path "$(payload_for_glob "~/**/*.pem")"

  assert_ask
}

@test "continues for ordinary Glob patterns" {
  run_hook path "$(payload_for_glob "src/**/*.ts")"

  assert_continue
}

@test "matches the shared command cases" {
  local failures=0 count=0
  local command expected observed

  while IFS= read -r encoded; do
    count=$((count + 1))
    command=$(printf '%s' "$encoded" | jq -r '.command')
    expected=$(printf '%s' "$encoded" | jq -r '.expected')

    run_hook command "$(payload_for_command "$command")"
    observed=$(observed_decision)

    if [ "$observed" != "$expected" ]; then
      printf 'expected %s, got %s: %q\n' "$expected" "$observed" "$command" >&3
      failures=$((failures + 1))
    fi
  done < <(jq -c '.[]' "$FIXTURES/command-cases.json")

  printf 'checked %s command cases\n' "$count" >&3
  [ "$count" -gt 0 ]
  [ "$failures" -eq 0 ]
}

@test "matches the shared path cases" {
  local failures=0 count=0
  local payload expected observed

  while IFS= read -r encoded; do
    count=$((count + 1))
    payload=$(printf '%s' "$encoded" | jq -c '{tool_name, tool_input}')
    expected=$(printf '%s' "$encoded" | jq -r '.expected')

    run_hook path "$payload"
    observed=$(observed_decision)

    if [ "$observed" != "$expected" ]; then
      printf 'expected %s, got %s: %s\n' "$expected" "$observed" "$payload" >&3
      failures=$((failures + 1))
    fi
  done < <(jq -c '.[]' "$FIXTURES/path-cases.json")

  printf 'checked %s path cases\n' "$count" >&3
  [ "$count" -gt 0 ]
  [ "$failures" -eq 0 ]
}
