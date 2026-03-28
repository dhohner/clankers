#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
MARKETPLACE_URI="file://$SCRIPT_DIR"

cat <<EOF2
This repository is now a Claude-format plugin marketplace.

Use one of these integration paths instead of the old symlink installer.

Claude Code:
  /plugin marketplace add $SCRIPT_DIR
  /plugin install commit-msg@dhohner-copilot
  /plugin install commit-split@dhohner-copilot
  /plugin install next-best-thing@dhohner-copilot
  /plugin install simplify@dhohner-copilot
  /plugin install block-package-managers@dhohner-copilot
  /plugin install lint-and-format@dhohner-copilot

VS Code Copilot:
  Add this marketplace to settings:
    "chat.plugins.marketplaces": ["dhohner/copilot", "$MARKETPLACE_URI"]

  Or register plugins directly during development:
    "chat.pluginLocations": {
      "$SCRIPT_DIR/plugins/commit-msg": true,
      "$SCRIPT_DIR/plugins/commit-split": true,
      "$SCRIPT_DIR/plugins/next-best-thing": true,
      "$SCRIPT_DIR/plugins/simplify": true,
      "$SCRIPT_DIR/plugins/block-package-managers": true,
      "$SCRIPT_DIR/plugins/lint-and-format": true
    }

Validate locally when Claude Code is available:
  claude plugin validate "$SCRIPT_DIR"
EOF2
