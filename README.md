# Copilot Prompts and Hooks

Global prompt library and hook set for GitHub Copilot in VS Code.

## Installation

### Quick Install (macOS/Linux)

```bash
git clone https://github.com/dhohner/copilot.git ~/copilot-prompts
cd ~/copilot-prompts
chmod +x install.sh
./install.sh
```

This installs both prompts and hooks by default.

### Install Options

```bash
./install.sh --prompts      # install prompts only
./install.sh --hooks        # install hooks only
./install.sh --prompts --hooks
./install.sh --help
```

Short flags are also available:

```bash
./install.sh -p
./install.sh -k
./install.sh -a
./install.sh -h
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

### Hooks Installation

`./install.sh --hooks` creates a single symlink from `~/.copilot/hooks` to this repo's `hooks/` directory. Copilot then loads hook configuration from `hooks/settings.json`.

Current bundled hook scripts:

- `pre-tool-use/block-package-managers.sh`: blocks `npm` and `npx` terminal commands and tells Copilot to use `pnpm` or `pnpm dlx` instead
- `post-tool-use/lint-and-format.sh`: runs `pnpm format` and `pnpm lint` after code-changing tools and provides feedback to Copilot if they fail

The current hook configuration registers:

- `PreToolUse`: `~/.copilot/hooks/pre-tool-use/block-package-managers.sh`
- `PostToolUse`: `~/.copilot/hooks/post-tool-use/lint-and-format.sh`

The scripts use `jq` to parse Copilot hook payloads, so make sure `jq` is available on your machine.

## Available Prompts

### `/simplify`

Reviews your recently changed files for code reuse, quality, and efficiency issues, then fixes them. Changes are left unstaged so you can review with `git diff`.

**Usage:**

```
/simplify
/simplify focus on memory efficiency
/simplify simplify staged files after this bug fix
```

**What it does:**

1. Determines scope (user-specified files → staged changes → latest commit), filters out binary/generated/vendor files, and confirms if >15 files
2. Loads project rules from `AGENTS.md`, `.github/copilot-instructions.md`, `CLAUDE.md`, or `.cursorrules` (first found)
3. Spawns three parallel review agents — Code Reuse, Code Quality, Efficiency — each returning structured findings with confidence and risk levels
4. Deduplicates findings, resolves conflicts between agents, and filters by confidence/risk
5. Auto-applies high/medium confidence + safe fixes; lists risky or low-confidence items for manual review
6. Reports applied changes, skipped items with reasons, and rollback instructions

### `/commit-msg`

Generate a commit message following project template for staged changes.

**Usage:**

```
#commit-msg
#commit-msg Generate for ticket AUTH-789
```

**Template:**

```
feat|chore|fix|refactor: ${commit message}

#body
Changes done

Issue: ${Jira Ticket Number}
```

**What it does:**

1. Analyzes staged changes
2. Determines correct commit type
3. Writes meaningful subject (50-72 chars)
4. Generates detailed body
5. Includes Jira ticket placeholder/number

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `chore`: Maintenance, deps, configs
- `refactor`: Code restructuring

### `/commit-split`

Suggest how to split staged changes into multiple logical commits.

**Usage:**

```
#commit-split
```

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
4. Use with `/your-prompt-name` in Copilot Chat

## Updating Prompts

Since these are symlinked, any changes you make to files in `prompts/` are immediately available in VS Code. No need to reinstall!

## Updating Hooks

Hooks are also symlinked, so edits under `hooks/` are picked up from `~/.copilot/hooks` immediately. Re-run `./install.sh --hooks` only if you need to recreate the symlink.

## Uninstall

```bash
rm ~/Library/Application\ Support/Code/User/copilot/prompts/*.prompt.md  # macOS
rm ~/.config/Code/User/copilot/prompts/*.prompt.md  # Linux
rm ~/.copilot/hooks  # remove global hooks symlink
```
