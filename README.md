# Copilot Plugins

My personal collection of Claude-format plugins for GitHub Copilot, Claude Code, and Codex app skill development.

> **⚠️ Important:** Make sure you trust a plugin before installing, updating, or using it. Plugins in this repository can include prompts, skills, hooks, and shell scripts that run on your machine. Review each plugin's README and source before use.

## Structure

- **`/.claude-plugin/marketplace.json`** - Marketplace catalog metadata for this repository
- **`/plugins`** - plugins developed and maintained in this repository

## Included Plugins

- **`commit-msg`** - Generates a structured commit message for staged changes
- **`commit-split`** - Suggests how to break staged changes into smaller logical commits
- **`next-best-thing`** - Recommends the single highest-leverage next improvement for the current repository
- **`simplify`** - Applies safe, behavior-preserving cleanup guidance for existing code
- **`block-package-managers`** - Blocks `npm` and `npx` terminal usage and redirects to `pnpm`
- **`lint-and-format`** - Runs `pnpm format` and `pnpm lint` after code-changing tools when scripts exist

## Installation

This repository supports two integration styles:

- Plugin marketplace installation for Claude Code and VS Code Copilot
- Direct skill symlinking for the Codex app during local development

Use the marketplace flow when you want installable Claude-format plugins. Use `install.sh` when you want the currently present repo skills to show up in Codex immediately.

### Codex App

The helper script symlinks every skill found under `plugins/*/skills/*/SKILL.md` into your Codex skills directory.

Install the current repo skills into the default Codex home:

```bash
./install.sh
```

Preview the links without changing anything:

```bash
./install.sh --dry-run
```

List the skills the script currently detects:

```bash
./install.sh --list-skills
```

Use a custom Codex home or explicit skills directory:

```bash
CODEX_HOME=/tmp/codex ./install.sh
CODEX_SKILLS_DIR=/absolute/path/to/skills ./install.sh
```

If a destination path already exists and you want to replace it, use:

```bash
./install.sh --force
```

By default the script is conservative: it updates existing symlinks, skips non-symlink collisions, and prints the marketplace setup options after it finishes.

### Claude Code

Add the marketplace:

```bash
/plugin marketplace add /absolute/path/to/copilot
```

Or add it from GitHub:

```bash
/plugin marketplace add dhohner/copilot
```

Install a plugin:

```bash
/plugin install {plugin-name}@dhohner-copilot
```

Available plugin names:

- `commit-msg`
- `commit-split`
- `next-best-thing`
- `simplify`
- `block-package-managers`
- `lint-and-format`

### VS Code Copilot

Register this repository as a marketplace in settings:

```json
{
  "chat.plugins.marketplaces": [
    "dhohner/copilot",
    "file:///absolute/path/to/copilot"
  ]
}
```

Validate the marketplace locally when Claude Code is available:

```bash
claude plugin validate /absolute/path/to/copilot
```

## Contributing

### Internal Plugins

All current plugins are first-party. To add a new plugin:

1. Create a new directory under `plugins/<plugin-name>`.
2. Add `.claude-plugin/plugin.json`.
3. Add the plugin assets it needs, such as a command prompt, skill, hooks, or scripts.
4. Add a `README.md` that explains what the plugin does and how to use it.
5. Register the plugin in `/.claude-plugin/marketplace.json`.

Existing plugins in `plugins/` are the best reference implementations for new additions.

## Plugin Structure

Each plugin in this repository is packaged as a small, focused installable unit, usually centered on a single command, skill, or hook.

```text
plugin-name/
├── .claude-plugin/
│   └── plugin.json      # Plugin metadata (required)
├── README.md            # Plugin documentation
├── command-name.md      # Slash command prompt (optional)
├── skills/
│   └── skill-name/
│       └── SKILL.md     # Skill definition (optional)
├── hooks/
│   └── hooks.json       # Hook registration (optional)
└── scripts/
    └── script.sh        # Hook implementation or helper script (optional)
```

## License

This repository is licensed under MIT. See [LICENSE](./LICENSE).

## Documentation

- Root marketplace catalog: [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json)
- Codex setup helper: [`install.sh`](./install.sh)
- Plugin-specific usage and behavior: [`plugins/`](./plugins)
