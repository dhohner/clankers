#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROMPTS_DIR="$SCRIPT_DIR/prompts"
HOOKS_DIR="$SCRIPT_DIR/hooks"
COPILOT_HOME_DIR="$HOME/.copilot"
COPILOT_HOOKS_DIR="$COPILOT_HOME_DIR/hooks"

print_help() {
    cat <<EOF2
Usage: ./install.sh [options]

Install Copilot prompts, hooks, or both.

Options:
  -p, --prompts   Install prompts only
  -k, --hooks     Install hooks only
  -a, --all       Install prompts and hooks
  -h, --help      Show this help message
      help        Show this help message

Examples:
  ./install.sh
  ./install.sh --prompts
  ./install.sh -k
  ./install.sh --prompts --hooks
EOF2
}

INSTALL_PROMPTS=false
INSTALL_HOOKS=false
HAS_SELECTION=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        -p|--prompts)
            INSTALL_PROMPTS=true
            HAS_SELECTION=true
            ;;
        -k|--hooks)
            INSTALL_HOOKS=true
            HAS_SELECTION=true
            ;;
        -a|--all)
            INSTALL_PROMPTS=true
            INSTALL_HOOKS=true
            HAS_SELECTION=true
            ;;
        -h|--help|help)
            print_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo ""
            print_help
            exit 1
            ;;
    esac
    shift
done

if [ "$HAS_SELECTION" = false ]; then
    INSTALL_PROMPTS=true
    INSTALL_HOOKS=true
fi

case "$(uname -s)" in
    Darwin*)
        VSCODE_USER_DIR="$HOME/Library/Application Support/Code/User"
        ;;
    Linux*)
        VSCODE_USER_DIR="$HOME/.config/Code/User"
        ;;
    MINGW*|MSYS*|CYGWIN*)
        VSCODE_USER_DIR="$APPDATA/Code/User"
        ;;
    *)
        echo "Unsupported operating system"
        exit 1
        ;;
esac

link_path() {
    local source="$1"
    local target="$2"
    local show_linked_message="${3:-true}"

    if [ -L "$target" ]; then
        echo "Removing existing symlink(s) in:"
        echo "  - $target"
        echo ""
        rm "$target"
    elif [ -e "$target" ]; then
        echo "Backing up existing path: $target -> $target.backup"
        mv "$target" "$target.backup"
    fi

    ln -s "$source" "$target"

    if [ "$show_linked_message" = true ]; then
        echo "Linked: $target"
    fi
}

COPILOT_PROMPTS_DIR="$VSCODE_USER_DIR/prompts"
INSTALLED_ANYTHING=false

install_prompts() {
    mkdir -p "$COPILOT_PROMPTS_DIR"

    echo "Installing Copilot prompts..."
    echo "Target: $COPILOT_PROMPTS_DIR"
    echo ""

    for prompt_file in "$PROMPTS_DIR"/*.prompt.md; do
        if [ -f "$prompt_file" ]; then
            filename=$(basename "$prompt_file")
            target="$COPILOT_PROMPTS_DIR/$filename"
            link_path "$prompt_file" "$target"
        fi
    done

    INSTALLED_ANYTHING=true
}

install_hooks() {
    if [ ! -d "$HOOKS_DIR" ]; then
        echo "Hooks directory not found: $HOOKS_DIR"
        exit 1
    fi

    if [ ! -f "$HOOKS_DIR/settings.json" ]; then
        echo "Hook settings file not found: $HOOKS_DIR/settings.json"
        exit 1
    fi

    mkdir -p "$COPILOT_HOME_DIR"
    find "$HOOKS_DIR" -type f -name "*.sh" -exec chmod +x {} +

    echo "Installing Copilot hooks..."
    echo ""

    link_path "$HOOKS_DIR" "$COPILOT_HOOKS_DIR" false

    echo "Symlinked hooks:"
    find "$HOOKS_DIR" -type f -name "*.sh" | sort | while read -r hook_file; do
        echo "  - ${hook_file#"$HOOKS_DIR"/}"
    done

    INSTALLED_ANYTHING=true
}

if [ "$INSTALL_PROMPTS" = true ]; then
    install_prompts
fi

if [ "$INSTALL_HOOKS" = true ]; then
    if [ "$INSTALL_PROMPTS" = true ]; then
        echo ""
    fi
    install_hooks
fi

if [ "$INSTALLED_ANYTHING" = true ]; then
    echo ""
    echo "Installation complete!"
fi
