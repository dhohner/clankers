#!/bin/bash

# Copilot Prompts Installer
# Symlinks prompt files to VS Code for global availability

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROMPTS_DIR="$SCRIPT_DIR/prompts"

# Detect OS and set VS Code user directory
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

# Create copilot prompts directory if it doesn't exist
COPILOT_PROMPTS_DIR="$VSCODE_USER_DIR/prompts"
mkdir -p "$COPILOT_PROMPTS_DIR"

echo "Installing Copilot prompts..."
echo "Source: $PROMPTS_DIR"
echo "Target: $COPILOT_PROMPTS_DIR"
echo ""

# Symlink each prompt file
for prompt_file in "$PROMPTS_DIR"/*.prompt.md; do
    if [ -f "$prompt_file" ]; then
        filename=$(basename "$prompt_file")
        target="$COPILOT_PROMPTS_DIR/$filename"
        
        # Remove existing symlink or file
        if [ -L "$target" ]; then
            echo "Removing existing symlink: $filename"
            rm "$target"
        elif [ -f "$target" ]; then
            echo "Backing up existing file: $filename → $filename.backup"
            mv "$target" "$target.backup"
        fi
        
        # Create symlink
        ln -s "$prompt_file" "$target"
        echo "✓ Linked: $filename"
    fi
done

echo ""
echo "Installation complete! 🎉"
echo ""
echo "Available prompts:"
for prompt_file in "$PROMPTS_DIR"/*.prompt.md; do
    if [ -f "$prompt_file" ]; then
        # Extract name from frontmatter if possible
        name=$(grep "^name:" "$prompt_file" | sed 's/name: *//' || basename "$prompt_file" .prompt.md)
        echo "  /$name"
    fi
done
echo ""
echo "Usage in VS Code Copilot Chat:"
echo "  /spec-interview @SPEC.md"
echo "  /spec-interview database design"
echo "  /code-review @src/components/Button.tsx"
echo "  /code-review Review my last commit"
echo "  /code-review @src/api/*.ts Check API changes"
echo "  /agents-check @src/modified-file.ts"
echo "  /agents-check Validate staged changes"