# Deny rules: commands whose primary output is the environment or a credential.
# Sourced by credential-guard.sh after shell-text.sh.

# Whole-environment access in interpreter one-liners. Single-variable reads such
# as process.env.PATH or os.environ.get("HOME") do not match. String literals
# are masked by strip_inner_literals before matching.
readonly ENV_OBJECT_JS='(^|[^A-Za-z0-9_.]|\.\.\.)process\??\.env([^.[?A-Za-z0-9_]|$)'
readonly ENV_OBJECT_DENO='Deno\??\.env\??\.toObject|(^|[^A-Za-z0-9_.])Deno\??\.env([^.[?A-Za-z0-9_]|$)'
readonly ENV_OBJECT_PY='((^|[^A-Za-z0-9_.])os\.environ([^.[A-Za-z0-9_]|$)|os\.environ\.(items|copy|keys|values)|from[[:space:]]+os[[:space:]]+import[[:space:]][^;]*environ)'

# The exact Pi runtime metadata command stays available.
is_allowed_env_command() {
  local command="$1"

  [[ "$command" != *$'\n'* && "$command" != *$'\r'* ]] || return 1
  matches "$command" "^[[:blank:]]*env[[:blank:]]*\\|[[:blank:]]*grep[[:blank:]]+('\^PI_'|\"\^PI_\")[[:blank:]]*\\|[[:blank:]]*sort[[:blank:]]*$"
}

# Prints the arguments without redirections, which do not change what a dump
# command prints.
strip_redirections() {
  local rest="$1"
  while [[ "$rest" =~ [[:space:]]*[0-9]*[\<\>]+\&?[[:space:]]*[^[:space:]]* ]]; do
    rest="${rest/"${BASH_REMATCH[0]}"/}"
  done
  printf '%s' "$rest"
}

is_environment_dump() {
  local word="$1" rest
  rest=$(strip_redirections "$2")

  case "$word" in
    printenv) return 0 ;;
    env) matches "$rest" "^([[:space:]]*(-[^[:space:]]+|[A-Za-z_][A-Za-z0-9_]*=${ASSIGNMENT_VALUE}))*[[:space:]]*\$" && return 0 ;;
    export) matches "$rest" '^[[:space:]]*(-p)?[[:space:]]*$' && return 0 ;;
    declare|typeset) matches "$rest" '^[[:space:]]*-[[:alnum:]]*[xp][[:alnum:]]*[[:space:]]*$' && return 0 ;;
    set) matches "$rest" '^[[:space:]]*$' && return 0 ;;
  esac

  return 1
}

is_interpreter_environment_dump() {
  local word="$1" rest="$2"

  case "$word" in
    node|bun) matches "$rest" '(^|[[:space:]])(-[A-Za-z]*[ep]|--eval|--print)' && matches "$(strip_inner_literals "$rest")" "$ENV_OBJECT_JS" && return 0 ;;
    deno) matches "$rest" '^[[:space:]]*eval([[:space:]]|$)' && matches "$(strip_inner_literals "$rest")" "$ENV_OBJECT_JS|$ENV_OBJECT_DENO" && return 0 ;;
    python*) matches "$rest" '(^|[[:space:]])-[A-Za-z]*c' && matches "$(strip_inner_literals "$rest")" "$ENV_OBJECT_PY" && return 0 ;;
  esac

  return 1
}

# Prints the arguments without leading global options, so that the subcommand
# comes first. $2 is an ERE of the CLI's options that take a separate value;
# every other option is a flag, and --option=value carries its own value.
strip_global_options() {
  local rest value_options="$2" option whole
  rest=$(ltrim "$1")
  while [[ "$rest" =~ ^(--?[A-Za-z][A-Za-z0-9-]*)(=[^[:space:]]*)?([[:space:]]+|$) ]]; do
    option="${BASH_REMATCH[1]}"
    whole="${BASH_REMATCH[0]}"
    rest="${rest#"$whole"}"
    [ "$whole" = "$option" ] || [[ "$whole" == "$option"=* ]] && continue
    [ -n "$value_options" ] && matches "$option" "^(${value_options})\$" || continue
    [[ "$rest" =~ ^[^[:space:]]+([[:space:]]+|$) ]] && rest="${rest#"${BASH_REMATCH[0]}"}"
  done
  printf '%s' "$rest"
}

# Global options that take a separate value, per CLI.
global_value_options() {
  case "$1" in
    gcloud) echo '--project|--account|--configuration|--billing-project|--format|--verbosity|--impersonate-service-account|--access-token-file|--flags-file' ;;
    aws) echo '--profile|--region|--output|--endpoint-url|--ca-bundle|--cli-read-timeout|--cli-connect-timeout|--color|--query|--cli-binary-format' ;;
    az) echo '--output|-o|--subscription|--query' ;;
    gh) echo '--repo|-R|--hostname' ;;
    op) echo '--account|--config|--session|--format|--encoding' ;;
    npm) echo '--registry|--userconfig|--prefix|--loglevel|--cache|--workspace|-w' ;;
    *) echo '' ;;
  esac
}

is_token_command() {
  local word="$1" rest
  rest=$(strip_global_options "$2" "$(global_value_options "$word")")

  case "$word" in
    security) matches "$rest" '^[[:space:]]*(find-generic-password|find-internet-password|dump-keychain)([[:space:]]|$)' && return 0 ;;
    gh)
      matches "$rest" '^[[:space:]]*auth[[:space:]]+token([[:space:]]|$)' && return 0
      matches "$rest" '^[[:space:]]*auth[[:space:]]+status.*[[:space:]](-t|--show-token)([[:space:]]|$)' && return 0
      ;;
    gcloud) matches "$rest" '^[[:space:]]*auth[[:space:]]+print-(access-token|identity-token)([[:space:]]|$)' && return 0 ;;
    aws) matches "$rest" '^[[:space:]]*configure[[:space:]]+export-credentials([[:space:]]|$)' && return 0 ;;
    az) matches "$rest" '^[[:space:]]*account[[:space:]]+get-access-token([[:space:]]|$)' && return 0 ;;
    op) matches "$rest" '^[[:space:]]*(read|item[[:space:]]+get)([[:space:]]|$)' && return 0 ;;
    npm) matches "$rest" '^[[:space:]]*token[[:space:]]+(list|create)([[:space:]]|$)' && return 0 ;;
  esac

  return 1
}

is_denied_command() {
  local word="$1" rest="$2"

  is_environment_dump "$word" "$rest" && return 0
  is_interpreter_environment_dump "$word" "$rest" && return 0
  is_token_command "$word" "$rest" && return 0
  return 1
}
