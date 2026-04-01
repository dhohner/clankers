# Copilot Plugins

My personal collection of installable plugins for GitHub Copilot in Visual Studio Code, Claude Code, and Codex.

Tools:

- GitHub Copilot in Visual Studio Code
- Claude Code (untested)
- Codex app and CLI

> **⚠️ Important:** Make sure you trust a plugin before installing, updating, or using it. Plugins in this repository can include prompts, skills, hooks, and shell scripts that run on your machine. Review each plugin's README and source before use.

## Structure

- **`/.agents/plugins/marketplace.json`** - Codex plugin marketplace catalog for this repository
- **`/.claude-plugin/marketplace.json`** - Marketplace catalog metadata for this repository
- **`/plugins`** - plugins developed and maintained in this repository

## Included Plugins

- **`commit-tools`** - Bundles `message` and `split` skills for staged commit workflows
- **`project-advisor`** - Packages repository planning skills, including `next-best-thing`
- **`refactor-tools`** - Packages safe cleanup and refactor skills, including `simplify`
- **`block-package-managers`** - Blocks `npm` and `npx` terminal usage and redirects to `pnpm`
- **`lint-and-format`** - Runs `pnpm format` and `pnpm lint` after code-changing tools when scripts exist

## Installation

This repository supports two integration styles:

- Plugin marketplace installation for Codex, Claude Code, and VS Code Copilot
- Direct skill and hook installation for the Codex app during local development

Use the marketplace flow when you want installable plugins in Codex or Claude-format plugins for GitHub Copilot in Visual Studio Code. Use `install.sh` when you want the current repo skills to show up in Codex immediately and the repo hook plugins to be installed into Codex's global hooks file.

### Codex Plugin Directory

This repo now includes a repo-scoped Codex marketplace at [`.agents/plugins/marketplace.json`](./.agents/plugins/marketplace.json).

The following plugins are packaged with native Codex manifests and can be installed from the Codex plugin directory when this repo is open:

- `commit-tools`
- `project-advisor`
- `refactor-tools`

The two hook-only utilities still use the direct install flow below for Codex:

- `block-package-managers`
- `lint-and-format`

### Codex App

The helper script does two things:

- symlinks every skill found under `plugins/*/skills/*/SKILL.md` into your Codex skills directory
- merges every hook plugin found under `plugins/*/hooks/hooks.json` into a Codex-compatible global hooks file at `~/.codex/hooks.json`

Skills are linked by their `skills/<name>/` directory names. For example, the `commit-tools` plugin currently installs the `message` and `split` skills.

Current hook plugins installed into Codex are:

- `block-package-managers` for `PreToolUse`
- `lint-and-format` for `PostToolUse`

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

List the hook plugins the script currently detects:

```bash
./install.sh --list-hooks
```

Use a custom Codex home or explicit skills directory:

```bash
CODEX_HOME=/tmp/codex ./install.sh
CODEX_SKILLS_DIR=/absolute/path/to/skills ./install.sh
```

Use a custom hooks file path:

```bash
CODEX_HOOKS_FILE=/absolute/path/to/hooks.json ./install.sh
```

If a destination path already exists and you want to replace it, use:

```bash
./install.sh --force
```

By default the script is conservative:

- it updates existing skill symlinks when they already point somewhere else
- it skips non-symlink skill collisions unless `--force` is used
- it refuses to replace an existing Codex hooks file unless `--force` is used
- when `--force` replaces an existing hooks file, it first writes a timestamped backup next to it

Important Codex hook notes:

- Codex hooks require `codex_hooks = true` under `[features]` in `~/.codex/config.toml`
- the generated `~/.codex/hooks.json` uses absolute paths into this repository clone
- if you move or rename this clone, rerun `./install.sh` so the hook commands point at the new location
- current Codex `PreToolUse` and `PostToolUse` matcher behavior is limited to `Bash`

### Claude Code

The plugin marketplace layout in this repository is intended to be compatible with Claude Code, including skill and hook packaging, but it is currently untested here.

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

- `commit-tools`
- `project-advisor`
- `refactor-tools`
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
2. Add `.claude-plugin/plugin.json` for Claude/Copilot compatibility.
3. Add `.codex-plugin/plugin.json` when the plugin should be installable from the Codex plugin directory.
4. Add the plugin assets it needs, such as a skill, hook, MCP config, or helper script.
5. Add a `README.md` that explains what the plugin does and how to use it.
6. Register the plugin in `/.claude-plugin/marketplace.json`.
7. Register the plugin in `/.agents/plugins/marketplace.json` when it should appear in Codex.

Existing plugins in `plugins/` are the best reference implementations for new additions.

## Plugin Structure

Each plugin in this repository is packaged as a small, focused installable unit, usually centered on a single skill or hook.

```text
plugin-name/
├── .codex-plugin/
│   └── plugin.json      # Codex plugin metadata (optional, required for Codex marketplace)
├── .claude-plugin/
│   └── plugin.json      # Claude/Copilot plugin metadata (optional, required for Claude marketplace)
├── README.md            # Plugin documentation
├── skills/
│   └── skill-name/
│       └── SKILL.md     # Skill definition (optional, preferred)
├── hooks/
│   └── hooks.json       # Hook registration (optional)
├── .mcp.json            # MCP server configuration (optional)
└── scripts/
    └── script.sh        # Hook implementation or helper script (optional)
```

Legacy `commands/*.md` files still work in some tools, but this repository now uses `skills/<name>/SKILL.md` as the default format for user-invoked slash commands and model-readable skills.

## License

This repository is licensed under MIT. See [LICENSE](./LICENSE).

## Documentation

- Root Codex marketplace catalog: [`.agents/plugins/marketplace.json`](./.agents/plugins/marketplace.json)
- Root marketplace catalog: [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json)
- Codex setup helper: [`install.sh`](./install.sh)
- Plugin-specific usage and behavior: [`plugins/`](./plugins)
