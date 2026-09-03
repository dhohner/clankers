# Shell text preprocessing: turns a terminal command into simple commands whose
# first word is the command that runs. Sourced by credential-guard.sh.

# Stands in for shell syntax that is data in context, such as a quoted "|".
readonly MASK=$'\001'
readonly SHELL_C_QUOTED='(bash|sh|zsh|dash|ksh)([[:space:]]+-[A-Za-z]+)*[[:space:]]+-[A-Za-z]*c[[:space:]]+('"'"'([^'"'"']*)'"'"'|"([^"]*)")'
readonly EVAL_QUOTED='(^|[;&|(`{][[:space:]]*)eval[[:space:]]+('"'"'([^'"'"']*)'"'"'|"([^"]*)")'
readonly SHELL_C_BARE='^(bash|sh|zsh|dash|ksh)([[:space:]]+-[A-Za-z]+)*[[:space:]]+-[A-Za-z]*c[[:space:]]+(.*)$'
readonly HEREDOC='<<-?[[:space:]]*['"'"'"]?([A-Za-z_][A-Za-z0-9_]*)'
# A shell assignment value: quoted spans or unquoted characters.
readonly ASSIGNMENT_VALUE='("[^"]*"|'"'"'[^'"'"']*'"'"'|[^[:space:]"'"'"'])*'
# Segments starting with one of these need the wrapper-stripping sed pass.
readonly WRAPPER_HINT='^([{!]|[A-Za-z_][A-Za-z0-9_]*=|(sudo|doas|command|builtin|exec|time|nice|nohup|xargs|caffeinate|env)[[:space:]]|/usr/bin/|/bin/|/usr/local/bin/)'

NORMALIZED=''

matches() {
  [[ "$1" =~ $2 ]]
}

ltrim() {
  local s="$1"
  printf '%s' "${s#"${s%%[![:space:]]*}"}"
}

strip_quotes() {
  local s="$1"
  s="${s#[\"\']}"
  printf '%s' "${s%[\"\']}"
}

# A heredoc fed to cat or tee is file data, so its body is dropped before
# matching. A body fed to python or node is rewritten as one-liners so that the
# interpreter rules apply to it. Every other body stays in the text as commands.
strip_data_heredocs() {
  local line delimiter='' prefix='' head verb word
  while IFS= read -r line || [ -n "$line" ]; do
    if [ -n "$delimiter" ]; then
      if [ "$(ltrim "$line")" = "$delimiter" ]; then
        delimiter=''
      elif [ -n "$prefix" ]; then
        printf '%s%s\n' "$prefix" "$(printf '%s' "$line" | tr ';|&()`' "$MASK$MASK$MASK$MASK$MASK$MASK")"
      fi
      continue
    fi
    printf '%s\n' "$line"
    [[ "$line" =~ $HEREDOC ]] || continue
    word="${BASH_REMATCH[1]}"
    head="${line%%<<*}"
    head="${head##*[;|&\(\`]}"
    normalize_segment "$head"
    verb="${NORMALIZED%%[[:space:]]*}"
    case "$verb" in
      cat|tee) delimiter="$word"; prefix='' ;;
      python*) delimiter="$word"; prefix='python3 -c ' ;;
      node|bun) delimiter="$word"; prefix='node -e ' ;;
    esac
  done
}

# Quoted strings handed to a nested shell lose their quotes so that the
# separators inside them split the text like the outer command. The shell word
# stays in place, and check_segment recurses into what follows its -c flag.
inline_nested_shells() {
  local text="$1" quoted inner rounds=0
  while [ "$rounds" -lt 20 ]; do
    rounds=$((rounds + 1))
    if [[ "$text" =~ $SHELL_C_QUOTED ]]; then
      quoted="${BASH_REMATCH[3]}"
      inner="${BASH_REMATCH[4]}${BASH_REMATCH[5]}"
    elif [[ "$text" =~ $EVAL_QUOTED ]]; then
      quoted="${BASH_REMATCH[2]}"
      inner="${BASH_REMATCH[3]}${BASH_REMATCH[4]}"
    else
      break
    fi
    text="${text/"$quoted"/$inner}"
  done
  printf '%s' "$text"
}

# Masks backslash-escaped separators, which are literal characters.
mask_escaped_separators() {
  local chunk="$1"
  chunk="${chunk//\\;/$MASK}"
  chunk="${chunk//\\|/$MASK}"
  chunk="${chunk//\\&/$MASK}"
  chunk="${chunk//\\(/$MASK}"
  chunk="${chunk//\\)/$MASK}"
  chunk="${chunk//\\\`/$MASK}"
  printf '%s' "$chunk"
}

# Separators inside quotes are replaced with a mask character so that a quoted
# argument such as "pat|token" stays one token. Command substitution inside
# double quotes still runs, so $( and backticks are kept there.
mask_quoted_separators() {
  local text="$1" out='' chunk quote
  while [[ "$text" == *[\"\']* ]]; do
    chunk="${text%%[\"\']*}"
    quote="${text:${#chunk}:1}"
    text="${text:${#chunk}+1}"
    out="$out$(mask_escaped_separators "$chunk")$quote"
    chunk="${text%%$quote*}"
    [ "$chunk" != "$text" ] || break
    text="${text:${#chunk}+1}"
    chunk="${chunk//;/$MASK}"
    chunk="${chunk//|/$MASK}"
    chunk="${chunk//&/$MASK}"
    if [ "$quote" = "'" ]; then
      chunk="${chunk//\`/$MASK}"
    fi
    if [ "$quote" = "'" ] || [[ "$chunk" != *'$('* && "$chunk" != *'`'* ]]; then
      chunk="${chunk//(/$MASK}"
      chunk="${chunk//)/$MASK}"
    fi
    out="$out$chunk$quote"
  done
  printf '%s%s' "$out" "$(mask_escaped_separators "$text")"
}

# Bash pattern substitution is quadratic on long strings in bash 3.2, so one
# awk call splits the text on every command separator.
split_segments() {
  mask_quoted_separators "$1" | awk '{ gsub(/&&|\|\||\$\(|`|[;|&()]/, "\n"); print }'
}

# Sets NORMALIZED to the segment without leading assignments, wrapper commands,
# and bin prefixes, so that its first word is the command that runs.
normalize_segment() {
  local s prev=''
  s="${1#"${1%%[![:space:]]*}"}"
  while [ "$s" != "$prev" ]; do
    prev="$s"
    [[ "$s" =~ $WRAPPER_HINT ]] || break
    s=$(printf '%s' "$s" | sed -E \
      -e 's/^[[:space:]]+//' \
      -e 's/^[{!][[:space:]]*//' \
      -e "s/^([A-Za-z_][A-Za-z0-9_]*=${ASSIGNMENT_VALUE}[[:space:]]+)+//" \
      -e 's#^(/usr/bin/|/bin/|/usr/local/bin/)?(sudo|doas|command|builtin|exec|time|nice|nohup|xargs|caffeinate)([[:space:]]+(-[ugUhpC][[:space:]]+[^-[:space:]]+|-[A-Za-z]+[[:space:]]+[0-9]+|-[^[:space:]]+))*[[:space:]]+##' \
      -e "s#^(/usr/bin/|/bin/)?env([[:space:]]+(-[^[:space:]]+|[A-Za-z_][A-Za-z0-9_]*=${ASSIGNMENT_VALUE}))*[[:space:]]+([^-=<>&[:space:]0-9][^=<>[:space:]]*)([[:space:]]|\$)#\\5\\6#" \
      -e 's#^(/usr/bin/|/bin/|/usr/local/bin/)([A-Za-z])#\2#')
  done
  NORMALIZED="$s"
}

# Prints the {expression} spans of a Python f-string literal, each followed by
# the mask, so that code inside the literal is still matched.
fstring_expressions() {
  local literal="$1" spans=''
  while [[ "$literal" =~ \{[^{}]*\} ]]; do
    spans="$spans${BASH_REMATCH[0]}$MASK"
    literal="${literal/"${BASH_REMATCH[0]}"/}"
  done
  printf '%s' "$spans"
}

# Prints the code argument without its inner string literals. The first quote
# character in the text wraps the code, so spans of the other quote character
# and escaped spans of the same character are literals. A literal with an f
# prefix keeps its embedded expressions.
strip_inner_literals() {
  local code="$1" first inner literal before replacement
  first="${code%%[\"\']*}"
  first="${code:${#first}:1}"
  case "$first" in
    \") inner="'[^']*'|\\\\\"[^\"]*\\\\\"" ;;
    \') inner="\"[^\"]*\"|\\\\'[^']*\\\\'" ;;
    *) printf '%s' "$code"; return 0 ;;
  esac
  while [[ "$code" =~ $inner ]]; do
    literal="${BASH_REMATCH[0]}"
    before="${code%%"$literal"*}"
    replacement="$MASK"
    if [[ "$before" =~ (^|[^A-Za-z0-9_])[rRbB]?[fF][rRbB]?$ ]]; then
      replacement="$MASK$(fstring_expressions "$literal")"
    fi
    code="${code/"$literal"/$replacement}"
  done
  printf '%s' "$code"
}
