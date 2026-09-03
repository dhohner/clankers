# Path rules: which operands of a command or tool call name a credential file
# or start a credential sweep. Sourced by credential-guard.sh after shell-text.sh.

# Home directory spellings that mark a credential sweep when a search is rooted there.
readonly HOME_ROOT='(~|\$HOME|\$\{HOME\}|/root|/Users/[^/[:space:]]+|/home/[^/[:space:]]+)'
# Segments without one of these substrings cannot reference a credential path.
readonly PATH_HINT='\.pem|\.env|\.ssh/|_history|\.git-credentials|\.netrc|\.pypirc|\.npmrc|\.zshrc|\.zshenv|\.zprofile|\.bashrc|\.bash_profile|\.profile|\.aws/|\.kube/|\.docker/|\.config/|\.azure/|\.terraform\.d/|/proc/|~|\$HOME|\$\{HOME\}|/root|/Users/|/home/'

CLASS=''
OUTPUT_FLAGS=''

# Sets CLASS and OUTPUT_FLAGS. Metadata verbs never print content. Generators
# create fresh keys, so the operands of their OUTPUT_FLAGS are exempt while any
# other operand is a read. Search verbs read operands but their pattern argument
# is not a path. find enumerates without reading unless it executes a command.
# Every other verb is a reader.
verb_class() {
  local word="$1" rest="$2"

  OUTPUT_FLAGS=''

  case "$word" in
    ls|test|\[|stat|rm|rmdir|chmod|chown|file|du|touch|mkdir|shred|realpath|basename|dirname|readlink) CLASS=metadata ;;
    find|fd|fdfind)
      if matches "$rest" '(^|[[:space:]])(-exec|-execdir|-ok|-okdir|-x|--exec|-X|--exec-batch)([[:space:]]|$)'; then
        CLASS=find_exec
      else
        CLASS=find
      fi
      ;;
    openssl)
      case "${rest%%[[:space:]]*}" in
        req|genrsa|genpkey|ecparam|dsaparam|dhparam|gendsa|rand) CLASS=generator; OUTPUT_FLAGS='-out|-keyout' ;;
        *) CLASS=reader ;;
      esac
      ;;
    mkcert) CLASS=generator; OUTPUT_FLAGS='-key-file|-cert-file|-p12-file' ;;
    ssh-keygen)
      # These modes read the key named by -f instead of creating it.
      if matches "$rest" '(^|[[:space:]])-[A-Za-z]*[ypelcBisDYKRFHrQ]([[:space:]]|$)'; then
        CLASS=reader
      else
        CLASS=generator
        OUTPUT_FLAGS='-f'
      fi
      ;;
    grep|egrep|fgrep|rg|ag|ack) CLASS=search ;;
    git)
      if matches "$rest" '^[[:space:]]*grep([[:space:]]|$)'; then CLASS=search; else CLASS=reader; fi
      ;;
    *) CLASS=reader ;;
  esac
}

# Prints what a search option does with its value: "skip" drops the next
# token, "read" emits the next token as a file, "read=VALUE" emits an attached
# file, and "none" for everything else. The first e or f in a short cluster
# takes the rest of the cluster as its value, and the next token only when
# nothing follows it. A pattern is never a file, but a pattern file is read.
search_option_action() {
  local token="$1" cluster letter

  case "$token" in
    --file) echo read; return 0 ;;
    --regexp|-g|--glob|-t|--type|-A|-B|-C|-m|--max-count|--iglob) echo skip; return 0 ;;
    --*) echo none; return 0 ;;
    -*[ef]*)
      cluster="${token#-}"
      cluster="${cluster#"${cluster%%[ef]*}"}"
      letter="${cluster:0:1}"
      if [ "${#cluster}" -eq 1 ]; then
        [ "$letter" = f ] && echo read || echo skip
      else
        [ "$letter" = f ] && echo "read=${cluster#?}" || echo none
      fi
      ;;
    *) echo none ;;
  esac
}

# Prints what an option does with its value for a generator, reader, find, or
# enumerate class: "skip" for a generator output flag, "read=VALUE" for an
# attached value, and "none" otherwise. Attached values reach the path rules
# because a reader such as ssh-keygen -y -fkey.pem names its input that way.
option_action() {
  local class="$1" token="$2" value

  if [ "$class" = generator ]; then
    if matches "$token" "^(${OUTPUT_FLAGS})\$"; then
      echo skip
      return 0
    fi
    if matches "$token" "^(${OUTPUT_FLAGS})"; then
      echo none
      return 0
    fi
  fi
  value="${token#-?}"
  [ -n "$value" ] && echo "read=$value" || echo none
}

# Prints the operand tokens of a segment, one per line. A search verb loses its
# pattern argument, given positionally or through -e or --regexp, but keeps a
# pattern file from -f or --file. A generator loses the operands of its output
# flags. Option values after = or attached to a short option are operands.
operand_tokens() {
  local class="$1" rest="$2" token action name value skip_next=0 emit_next=0 pattern_dropped=0 has_pattern_flag=0

  if [ "$class" = search ] && matches "$rest" '^[[:space:]]*grep([[:space:]]|$)'; then
    rest=$(ltrim "$rest")
    rest="${rest#grep}"
  fi
  rest="${rest//\'\'/$MASK}"
  if [ "$class" = search ] && matches "$rest" '(^|[[:space:]])(-[A-DG-Za-df-z]*[ef]|--regexp|--file)'; then
    has_pattern_flag=1
  fi

  while IFS= read -r token; do
    [ -n "$token" ] || continue
    if [ "$skip_next" -eq 1 ]; then
      skip_next=0
      continue
    fi
    if [ "$emit_next" -eq 1 ]; then
      emit_next=0
      printf '%s\n' "$token"
      continue
    fi
    case "$token" in
      -*=*)
        name="${token%%=*}"
        value="${token#*=}"
        case "$class" in
          metadata) continue ;;
          search) [ "$name" = --file ] || continue ;;
          generator) matches "$name" "^(${OUTPUT_FLAGS})\$" && continue ;;
        esac
        [ -n "$value" ] && printf '%s\n' "$value"
        continue
        ;;
      -*)
        case "$class" in
          metadata) continue ;;
          search) action=$(search_option_action "$token") ;;
          *) action=$(option_action "$class" "$token") ;;
        esac
        case "$action" in
          skip) skip_next=1 ;;
          read) emit_next=1 ;;
          read=*) printf '%s\n' "${action#read=}" ;;
        esac
        continue
        ;;
    esac
    if [ "$class" = search ] && [ "$has_pattern_flag" -eq 0 ] && [ "$pattern_dropped" -eq 0 ]; then
      pattern_dropped=1
      continue
    fi
    printf '%s\n' "$token"
  done < <(printf '%s\n' "${rest//\"\"/$MASK}" | tr '<>' '  ' | tr -d "\"'" | tr -s '[:space:]' '\n')
}

is_sweep_root() {
  matches "$1" "^${HOME_ROOT}/?$|^${HOME_ROOT}/\.[^/]+(/.*)?$|^${HOME_ROOT}/\*"
}

# Prints the rule name when the token names a credential file, else nothing.
credential_file_rule() {
  local token="$1" base="${1##*/}"

  case "$token" in
    *.ssh/*)
      if matches "$base" '^id_[A-Za-z0-9_-]+$' || [ "${base%.pem}" != "$base" ]; then
        echo "private key"
        return 0
      fi
      ;;
  esac
  case "$base" in
    cert.pem|fullchain.pem|chain.pem|ca.pem|cacert.pem|*-cert.pem) ;;
    *.pem) echo "private key"; return 0 ;;
  esac
  if matches "$base" '^\.env(\.(local|development|production|staging|test))?$'; then
    echo "dotenv file"
    return 0
  fi
  case "$base" in
    .bash_history|.zsh_history|.python_history|.psql_history|.mysql_history|.git-credentials|.netrc|.pypirc|.npmrc)
      echo "credential file"
      return 0
      ;;
    .zshrc|.zshenv|.zprofile|.bashrc|.bash_profile|.profile)
      echo "shell rc file"
      return 0
      ;;
  esac
  if matches "$token" '(^|/)\.(aws/credentials|kube/config|docker/config\.json)$' \
    || matches "$token" '(^|/)\.config/gcloud/(application_default_credentials\.json|credentials\.db)$' \
    || matches "$token" '(^|/)\.config/gh/hosts\.yml$' \
    || matches "$token" '(^|/)\.azure/[^/]' \
    || matches "$token" '(^|/)\.terraform\.d/credentials\.tfrc\.json$' \
    || matches "$token" '^/proc/[^/]+/environ$'; then
    echo "credential file"
  fi
}

# Records an ask when the token names a credential file. Classes: reader and
# generator check every rule, search and find_exec add the sweep rule, find and
# enumerate check only the sweep rule, and metadata verbs skip every rule.
check_operand() {
  local class="$1" verb="$2" token="$3" rule

  case "$class" in
    metadata) return 0 ;;
    search|find|find_exec|enumerate)
      if is_sweep_root "$token"; then
        record_ask "credential sweep: $verb searches under $token"
        return 0
      fi
      case "$class" in
        find|enumerate) return 0 ;;
      esac
      ;;
  esac

  rule=$(credential_file_rule "$token")
  [ -z "$rule" ] || record_ask "$rule: $verb reads $token"
}
