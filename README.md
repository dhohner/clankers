# Copilot Prompts

Global prompt library for GitHub Copilot in VS Code.

## Installation

### Quick Install (macOS/Linux)

```bash
git clone https://github.com/yourusername/copilot-prompts.git ~/copilot-prompts
cd ~/copilot-prompts
chmod +x install.sh
./install.sh
```

### Manual Installation

#### macOS

```bash
ln -s ~/copilot-prompts/prompts/*.prompt.md \
  ~/Library/Application\ Support/Code/User/copilot/prompts/
```

#### Linux

```bash
ln -s ~/copilot-prompts/prompts/*.prompt.md \
  ~/.config/Code/User/copilot/prompts/
```

#### Windows (PowerShell as Administrator)

```powershell
New-Item -ItemType SymbolicLink `
  -Path "$env:APPDATA\Code\User\copilot\prompts\spec-interview.prompt.md" `
  -Target "$HOME\copilot-prompts\prompts\spec-interview.prompt.md"
```

## Available Prompts

### `#spec-interview`

Deep dive interview for creating comprehensive specifications.

**Usage:**

```
#spec-interview @SPEC.md
#spec-interview authentication system
#spec-interview @components/Button.tsx
```

**What it does:**

- Asks batched, non-obvious questions about implementation, UX, tradeoffs
- Questions are independent within each batch
- Continues until complete understanding
- Synthesizes into comprehensive spec document

## Adding New Prompts

1. Create a new `.prompt.md` file in the `prompts/` directory
2. Use this template:

```yaml
---
agent: agent
name: your-prompt-name
description: Brief description
---
Your prompt instructions here...
```

3. Run `./install.sh` to update symlinks
4. Use with `#your-prompt-name` in Copilot Chat

## Updating Prompts

Since these are symlinked, any changes you make to files in `prompts/` are immediately available in VS Code. No need to reinstall!

## Uninstall

```bash
rm ~/Library/Application\ Support/Code/User/copilot/prompts/*.prompt.md  # macOS
rm ~/.config/Code/User/copilot/prompts/*.prompt.md  # Linux
```

## Contributing

Feel free to submit PRs with new useful prompts!

## Tips

- Keep prompts focused on a single purpose
- Use descriptive `name` values (they become the `#command`)
- Test prompts before committing
- Document usage examples in this README
