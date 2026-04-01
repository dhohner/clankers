#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODEX_HOME_DIR="${CODEX_HOME:-$HOME/.codex}"
CODEX_HOOKS_FILE="${CODEX_HOOKS_FILE:-$CODEX_HOME_DIR/hooks.json}"
CODEX_CONFIG_FILE="$CODEX_HOME_DIR/config.toml"

DRY_RUN=0
LIST_HOOKS=0
FORCE=0

init_colors() {
  if [[ -t 1 && -z "${NO_COLOR:-}" && "${TERM:-}" != "dumb" ]]; then
    RESET=$'\033[0m'
    BOLD=$'\033[1m'
    DIM=$'\033[2m'
    BLUE=$'\033[34m'
    CYAN=$'\033[36m'
    GREEN=$'\033[32m'
    YELLOW=$'\033[33m'
    RED=$'\033[31m'
  else
    RESET=""
    BOLD=""
    DIM=""
    BLUE=""
    CYAN=""
    GREEN=""
    YELLOW=""
    RED=""
  fi
}

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Generate a Codex-compatible merged hooks file from repo hook plugins.

Options:
  --dry-run       Show what would be changed without writing anything.
  --list-hooks    Print detected hook plugins and exit.
  --force         Replace an existing hooks file after creating a backup.
  --help          Show this help text.

Environment overrides:
  CODEX_HOME         Base Codex home directory. Default: $HOME/.codex
  CODEX_HOOKS_FILE   Explicit Codex hooks file path.

Examples:
  ./install.sh
  ./install.sh --dry-run
  ./install.sh --list-hooks
  CODEX_HOME=/tmp/codex ./install.sh
  CODEX_HOOKS_FILE=/custom/hooks.json ./install.sh --force

Notes:
  - Hook plugins are discovered from plugins/*/hooks/hooks.json.
  - Codex hooks require [features] codex_hooks = true in ~/.codex/config.toml.
EOF
}

discover_hook_files() {
  find "$SCRIPT_DIR/plugins" -type f -path '*/hooks/hooks.json' | sort
}

require_jq() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "jq is required to convert and merge Codex hook manifests." >&2
    exit 1
  fi
}

print_header() {
  if [[ -z "$1" ]]; then
    printf '\n'
    return
  fi

  printf '%b%s%b\n' "${BOLD}${BLUE}" "$1" "${RESET}"
}

print_kv() {
  printf '  %b%-18s%b %s\n' "${DIM}" "$1" "${RESET}" "$2"
}

print_item() {
  local message="$1"
  local color="$RESET"

  case "$message" in
    Would*) color="$CYAN" ;;
    Linked*|Updated*|Replaced*|Installed*|Backed*) color="$GREEN" ;;
    Skipped*|WARNING:*|Warning:*) color="$YELLOW" ;;
    *already*) color="$DIM" ;;
  esac

  printf '  %b-%b %s\n' "$color" "$RESET" "$message"
}

list_hooks() {
  local hook_files hook_file plugin_dir plugin_name events

  hook_files=()
  while IFS= read -r hook_file; do
    hook_files+=("$hook_file")
  done < <(discover_hook_files)

  if [[ ${#hook_files[@]} -eq 0 ]]; then
    print_header "Hooks"
    print_item "No hook plugins found under $SCRIPT_DIR/plugins."
    print_kv "Destination" "$CODEX_HOOKS_FILE"
    return
  fi

  require_jq

  print_header "Hooks"
  for hook_file in "${hook_files[@]}"; do
    plugin_dir="$(dirname "$(dirname "$hook_file")")"
    plugin_name="$(basename "$plugin_dir")"
    events="$(jq -r '.hooks | keys | join(", ")' "$hook_file")"
    print_item "$plugin_name [$events] -> $hook_file"
  done
  print_kv "Destination" "$CODEX_HOOKS_FILE"
}

hook_feature_enabled() {
  if [[ ! -f "$CODEX_CONFIG_FILE" ]]; then
    return 1
  fi

  awk '
    /^\[.*\][[:space:]]*$/ { in_features = ($0 ~ /^\[features\][[:space:]]*$/) }
    in_features && /^[[:space:]]*codex_hooks[[:space:]]*=[[:space:]]*true([[:space:]]*(#.*)?)?$/ { found = 1 }
    END { exit found ? 0 : 1 }
  ' "$CODEX_CONFIG_FILE"
}

print_hook_feature_warning() {
  printf '%bWARNING:%b Codex hooks are installed but inactive.\n' "${BOLD}${YELLOW}" "${RESET}"
  printf '  1. Open %s\n' "$CODEX_CONFIG_FILE"
  printf '  2. Add:\n'
  printf '     %b[features]%b\n' "${CYAN}" "${RESET}"
  printf '     %bcodex_hooks = true%b\n' "${CYAN}" "${RESET}"
  printf '  3. Restart Codex\n'
}

generate_plugin_hook_doc() {
  local hook_file="$1"
  local plugin_dir

  plugin_dir="$(dirname "$(dirname "$hook_file")")"

  jq -c \
    --arg plugin_dir "$plugin_dir" '
      def rewrite_command:
        gsub("\\$\\{CLAUDE_PLUGIN_ROOT:-\\}"; $plugin_dir)
        | gsub("\\$\\{CLAUDE_PLUGIN_ROOT\\}"; $plugin_dir);

      def normalize_group($event):
        (if has("hooks") then . else {hooks: [.]} end)
        | if (($event == "PreToolUse" or $event == "PostToolUse") and ((.matcher? // "") == "")) then
            . + {matcher: "Bash"}
          else
            .
          end
        | if ((.matcher? // null) == null) then del(.matcher) else . end
        | .hooks |= map(
            if (.type? == "command" and (.command? | type) == "string") then
              .command |= rewrite_command
            else
              .
            end
          );

      {
        hooks: (
          (.hooks // {})
          | to_entries
          | map(
              .key as $event
              | {
                  key: $event,
                  value: [
                    .value[]
                    | normalize_group($event)
                  ]
                }
            )
          | from_entries
        )
      }
    ' "$hook_file"
}

generate_merged_hooks_json() {
  local output_file="$1"
  local work_dir="$2"
  local merged_file converted_file hook_file index

  merged_file="$work_dir/merged-hooks.json"
  jq -n '{hooks: {}}' > "$merged_file"

  index=0
  while IFS= read -r hook_file; do
    converted_file="$work_dir/converted-hook-$index.json"
    generate_plugin_hook_doc "$hook_file" > "$converted_file"

    jq -s '
      reduce .[] as $doc (
        {hooks: {}};
        reduce (($doc.hooks // {}) | to_entries[]) as $event (
          .;
          .hooks[$event.key] = ((.hooks[$event.key] // []) + $event.value)
        )
      )
    ' "$merged_file" "$converted_file" > "$work_dir/merged-next.json"

    mv "$work_dir/merged-next.json" "$merged_file"
    index=$((index + 1))
  done < <(discover_hook_files)

  jq '.' "$merged_file" > "$output_file"
}

install_hooks() {
  local merged_file="$1"
  local hook_files_count="$2"
  local backup_file timestamp

  if [[ $hook_files_count -eq 0 ]]; then
    return 0
  fi

  if [[ -e "$CODEX_HOOKS_FILE" && $FORCE -eq 0 ]]; then
    if [[ $DRY_RUN -eq 1 ]]; then
      print_item "Would skip hooks install because --force is required for: $CODEX_HOOKS_FILE"
      return 3
    fi

    echo "Hooks file already exists: $CODEX_HOOKS_FILE" >&2
    echo "Refusing to replace it without --force." >&2
    return 1
  fi

  if [[ $DRY_RUN -eq 1 ]]; then
    if [[ -e "$CODEX_HOOKS_FILE" ]]; then
      print_item "Would back up and replace hooks file: $CODEX_HOOKS_FILE"
    else
      print_item "Would write merged hooks file: $CODEX_HOOKS_FILE"
    fi
    print_item "Would merge $hook_files_count hook plugin(s) into one Codex hooks.json file"
    return 2
  fi

  mkdir -p "$(dirname "$CODEX_HOOKS_FILE")"

  if [[ -e "$CODEX_HOOKS_FILE" ]]; then
    timestamp="$(date +%Y%m%d%H%M%S)"
    backup_file="${CODEX_HOOKS_FILE}.bak.${timestamp}"
    cp "$CODEX_HOOKS_FILE" "$backup_file"
    print_item "Backed up hooks file: $backup_file"
  fi

  cp "$merged_file" "$CODEX_HOOKS_FILE"
  print_item "Installed merged hooks file: $CODEX_HOOKS_FILE"
  return 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      ;;
    --list-hooks)
      LIST_HOOKS=1
      ;;
    --force)
      FORCE=1
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

init_colors

if [[ $LIST_HOOKS -eq 1 ]]; then
  if [[ $LIST_HOOKS -eq 1 ]]; then
    list_hooks
  fi

  exit 0
fi

hook_files=()
while IFS= read -r hook_file; do
  hook_files+=("$hook_file")
done < <(discover_hook_files)

if [[ ${#hook_files[@]} -eq 0 ]]; then
  print_header "Codex Install"
  print_item "No hook plugins were found under $SCRIPT_DIR/plugins."
  exit 0
fi

require_jq

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/copilot-install.XXXXXX")"
cleanup() {
  rm -rf "$temp_dir"
}
trap cleanup EXIT

merged_hooks_file="$temp_dir/generated-hooks.json"
generate_merged_hooks_json "$merged_hooks_file" "$temp_dir"

if [[ ${#hook_files[@]} -gt 0 && -e "$CODEX_HOOKS_FILE" && $FORCE -eq 0 && $DRY_RUN -eq 0 ]]; then
  echo "Hooks file already exists: $CODEX_HOOKS_FILE" >&2
  echo "Refusing to replace it without --force." >&2
  exit 1
fi

print_header "Codex Install"

hooks_written=0
hooks_skipped=0
hooks_previewed=0

print_header ""
print_header "Hook Actions"
if install_hooks "$merged_hooks_file" "${#hook_files[@]}"; then
  hooks_written=1
else
  case $? in
    2)
      hooks_previewed=1
      ;;
    3)
      hooks_skipped=1
      ;;
    *)
      exit 1
      ;;
  esac
fi

print_header ""
print_header "Summary"
if [[ $DRY_RUN -eq 1 ]]; then
  print_kv "Hooks file" "$CODEX_HOOKS_FILE (dry run)"
else
  print_kv "Hooks file" "$CODEX_HOOKS_FILE"
fi
print_kv "Hook plugins" "${#hook_files[@]}"
if [[ $hooks_written -eq 1 ]]; then
  print_kv "Hooks result" "wrote merged hooks file"
elif [[ $hooks_previewed -eq 1 ]]; then
  print_kv "Hooks result" "previewed merged hooks file"
elif [[ $hooks_skipped -eq 1 ]]; then
  print_kv "Hooks result" "skipped because --force is required"
fi

if ! hook_feature_enabled; then
  print_header ""
  print_hook_feature_warning
fi
