#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARKETPLACE_URI="file://$SCRIPT_DIR"
CODEX_HOME_DIR="${CODEX_HOME:-$HOME/.codex}"
CODEX_SKILLS_DIR="${CODEX_SKILLS_DIR:-$CODEX_HOME_DIR/skills}"

usage() {
  cat <<EOF
Usage: $(basename "$0") [--help]

Symlink repository skills into the Codex app skill directory.

Environment overrides:
  CODEX_HOME         Base Codex home directory (default: $HOME/.codex)
  CODEX_SKILLS_DIR   Explicit Codex skills directory
EOF
}

if [[ "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -gt 0 ]]; then
  usage >&2
  exit 1
fi

mkdir -p "$CODEX_SKILLS_DIR"

skill_dirs=()
while IFS= read -r skill_md; do
  skill_dirs+=("$(dirname "$skill_md")")
done < <(find "$SCRIPT_DIR/plugins" -type f -path '*/skills/*/SKILL.md' | sort)

if [[ ${#skill_dirs[@]} -eq 0 ]]; then
  cat <<EOF
No skills were found under $SCRIPT_DIR/plugins.

Marketplace options remain available:
  Claude Code:
    /plugin marketplace add $SCRIPT_DIR

  VS Code Copilot:
    "chat.plugins.marketplaces": ["dhohner/copilot", "$MARKETPLACE_URI"]
EOF
  exit 0
fi

created=0
updated=0
skipped=0

for skill_dir in "${skill_dirs[@]}"; do
  skill_name="$(basename "$skill_dir")"
  link_path="$CODEX_SKILLS_DIR/$skill_name"

  if [[ -L "$link_path" ]]; then
    current_target="$(readlink "$link_path")"
    if [[ "$current_target" == "$skill_dir" ]]; then
      echo "Already linked: $link_path -> $skill_dir"
      ((skipped+=1))
      continue
    fi

    rm "$link_path"
    ln -s "$skill_dir" "$link_path"
    echo "Updated link: $link_path -> $skill_dir"
    ((updated+=1))
    continue
  fi

  if [[ -e "$link_path" ]]; then
    echo "Skipped existing path (not a symlink): $link_path" >&2
    ((skipped+=1))
    continue
  fi

  ln -s "$skill_dir" "$link_path"
  echo "Linked skill: $link_path -> $skill_dir"
  ((created+=1))
done

cat <<EOF

Codex skills directory: $CODEX_SKILLS_DIR
Skills linked: ${#skill_dirs[@]} total (${created} new, ${updated} updated, ${skipped} skipped)

Marketplace options also remain available:
  Claude Code:
    /plugin marketplace add $SCRIPT_DIR
    /plugin install commit-msg@dhohner-copilot
    /plugin install commit-split@dhohner-copilot
    /plugin install next-best-thing@dhohner-copilot
    /plugin install simplify@dhohner-copilot
    /plugin install block-package-managers@dhohner-copilot
    /plugin install lint-and-format@dhohner-copilot

  VS Code Copilot:
    "chat.plugins.marketplaces": ["dhohner/copilot", "$MARKETPLACE_URI"]
    "chat.pluginLocations": {
      "$SCRIPT_DIR/plugins/commit-msg": true,
      "$SCRIPT_DIR/plugins/commit-split": true,
      "$SCRIPT_DIR/plugins/next-best-thing": true,
      "$SCRIPT_DIR/plugins/simplify": true,
      "$SCRIPT_DIR/plugins/block-package-managers": true,
      "$SCRIPT_DIR/plugins/lint-and-format": true
    }
EOF
