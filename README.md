# Copilot Prompts, Hooks, and Skills

Global prompt, hook, and skill library for GitHub Copilot in VS Code.

## Installation

### Quick Install (macOS)

```bash
git clone https://github.com/dhohner/copilot.git ~/copilot-prompts
cd ~/copilot-prompts
chmod +x install.sh
./install.sh
```

This installs prompts, hooks, and skills by default.

### Install Options

```bash
./install.sh --prompts      # install prompts only
./install.sh --hooks        # install hooks only
./install.sh --skills       # install skills only
./install.sh --prompts --hooks --skills
./install.sh --help
```

Short flags are also available:

```bash
./install.sh -p
./install.sh -k
./install.sh -s
./install.sh -a
./install.sh -h
```

### Manual Installation

#### macOS

```bash
ln -s ~/copilot-prompts/prompts/*.prompt.md \
  ~/Library/Application\ Support/Code/User/copilot/prompts/
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

### Skills Installation

`./install.sh --skills` creates a symlink from `~/.copilot/skills` to this repo's `skills/` directory. Copilot then loads each skill from its bundled `SKILL.md` file.

Current bundled skills:

- `simplify`: applies safe, behavior-preserving cleanup edits to existing code and reports what was changed versus left manual

Add new skills by creating a new folder under `skills/` with a `SKILL.md` file. Re-run `./install.sh --skills` after adding or renaming skills to refresh the symlink.

### Available Prompts

- `/commit-msg`: generate a commit message following the project template
- `/commit-split`: suggest how to split staged changes into multiple logical commits

### `/commit-msg`

Generate a commit message following project template for staged changes.

**Usage:**

```
#commit-msg
#commit-msg Generate for ticket AUTH-789
```

**Template:**

```bash
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
rm ~/.copilot/hooks  # remove global hooks symlink
rm ~/.copilot/skills  # remove global skills symlink
```
