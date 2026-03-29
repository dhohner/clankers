#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARKETPLACE_URI="file://$SCRIPT_DIR"
CODEX_HOME_DIR="${CODEX_HOME:-$HOME/.codex}"
CODEX_SKILLS_DIR="${CODEX_SKILLS_DIR:-$CODEX_HOME_DIR/skills}"

DRY_RUN=0
LIST_ONLY=0
FORCE=0

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Symlink repository skills into the Codex app skills directory.

Options:
  --dry-run       Show what would be linked without changing anything.
  --list-skills   Print detected skills and exit.
  --force         Replace an existing non-symlink path at the destination.
  --help          Show this help text.

Environment overrides:
  CODEX_HOME         Base Codex home directory. Default: $HOME/.codex
  CODEX_SKILLS_DIR   Explicit Codex skills directory.

Examples:
  ./install.sh
  ./install.sh --dry-run
  CODEX_HOME=/tmp/codex ./install.sh
  CODEX_SKILLS_DIR=/custom/skills ./install.sh --force

Notes:
  - Skills are discovered automatically from plugins/*/skills/*/SKILL.md.
  - Marketplace usage for Claude Code and VS Code Copilot is printed after install.
EOF
}

discover_skill_dirs() {
  find "$SCRIPT_DIR/plugins" -type f -path '*/skills/*/SKILL.md' | sort | while IFS= read -r skill_md; do
    dirname "$skill_md"
  done
}

discover_plugin_dirs() {
  find "$SCRIPT_DIR/plugins" -mindepth 1 -maxdepth 1 -type d | sort
}

print_marketplace_help() {
  echo
  echo "Marketplace options also remain available:"
  echo "  Claude Code:"
  echo "    /plugin marketplace add $SCRIPT_DIR"

  while IFS= read -r plugin_dir; do
    plugin_name="$(basename "$plugin_dir")"
    echo "    /plugin install ${plugin_name}@dhohner-copilot"
  done < <(discover_plugin_dirs)

  echo
  echo "  VS Code Copilot:"
  echo "    \"chat.plugins.marketplaces\": [\"dhohner/copilot\", \"$MARKETPLACE_URI\"]"
  echo "    \"chat.pluginLocations\": {"

  first=1
  while IFS= read -r plugin_dir; do
    if [[ $first -eq 0 ]]; then
      echo ","
    fi

    printf '      "%s": true' "$plugin_dir"
    first=0
  done < <(discover_plugin_dirs)

  echo
  echo "    }"
}

link_skill() {
  local skill_dir="$1"
  local skill_name link_path current_target

  skill_name="$(basename "$skill_dir")"
  link_path="$CODEX_SKILLS_DIR/$skill_name"

  if [[ -L "$link_path" ]]; then
    current_target="$(readlink "$link_path")"
    if [[ "$current_target" == "$skill_dir" ]]; then
      echo "Already linked: $link_path -> $skill_dir"
      return 2
    fi

    if [[ $DRY_RUN -eq 1 ]]; then
      echo "Would update link: $link_path -> $skill_dir"
      return 1
    fi

    rm "$link_path"
    ln -s "$skill_dir" "$link_path"
    echo "Updated link: $link_path -> $skill_dir"
    return 1
  fi

  if [[ -e "$link_path" ]]; then
    if [[ $FORCE -eq 0 ]]; then
      echo "Skipped existing path (not a symlink): $link_path" >&2
      return 3
    fi

    if [[ $DRY_RUN -eq 1 ]]; then
      echo "Would replace existing path: $link_path -> $skill_dir"
      return 1
    fi

    rm -rf "$link_path"
    ln -s "$skill_dir" "$link_path"
    echo "Replaced existing path: $link_path -> $skill_dir"
    return 1
  fi

  if [[ $DRY_RUN -eq 1 ]]; then
    echo "Would link skill: $link_path -> $skill_dir"
    return 0
  fi

  ln -s "$skill_dir" "$link_path"
  echo "Linked skill: $link_path -> $skill_dir"
  return 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      ;;
    --list-skills)
      LIST_ONLY=1
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

skill_dirs=()
while IFS= read -r skill_dir; do
  skill_dirs+=("$skill_dir")
done < <(discover_skill_dirs)

if [[ $LIST_ONLY -eq 1 ]]; then
  if [[ ${#skill_dirs[@]} -eq 0 ]]; then
    echo "No skills found under $SCRIPT_DIR/plugins."
    exit 0
  fi

  echo "Detected skills:"
  for skill_dir in "${skill_dirs[@]}"; do
    echo "  $(basename "$skill_dir") -> $skill_dir"
  done
  exit 0
fi

if [[ ${#skill_dirs[@]} -eq 0 ]]; then
  echo "No skills were found under $SCRIPT_DIR/plugins."
  print_marketplace_help
  exit 0
fi

if [[ $DRY_RUN -eq 0 ]]; then
  mkdir -p "$CODEX_SKILLS_DIR"
fi

created=0
updated=0
skipped=0

for skill_dir in "${skill_dirs[@]}"; do
  if link_skill "$skill_dir"; then
    ((created+=1))
  else
    case $? in
      1)
        ((updated+=1))
        ;;
      2|3)
        ((skipped+=1))
        ;;
    esac
  fi
done

echo
if [[ $DRY_RUN -eq 1 ]]; then
  echo "Codex skills directory (dry run): $CODEX_SKILLS_DIR"
else
  echo "Codex skills directory: $CODEX_SKILLS_DIR"
fi
echo "Skills processed: ${#skill_dirs[@]} total (${created} new, ${updated} updated, ${skipped} skipped)"

print_marketplace_help
