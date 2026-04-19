# Clankers

My personal collection of installable plugins for GitHub Copilot in Visual Studio Code, Claude Code, and Codex, published as Clankers.

> **⚠️ Important:** Make sure you trust a plugin before installing, updating, or using it. Plugins in this repository can include prompts, skills, hooks, and shell scripts that run on your machine. Review each plugin's README and source before use.

Tools:

- GitHub Copilot in Visual Studio Code
- Claude Code (untested)
- Codex App

## Structure

- **`/.agents/plugins/marketplace.json`** - Codex App marketplace catalog for this repository
- **`/.claude-plugin/marketplace.json`** - Claude-format marketplace catalog used by Claude Code and VS Code agent plugins
- **`/plugins`** - plugins developed and maintained in this repository

## Included Plugins

### Available in Codex App Marketplace

- **`commit-tools`** - Bundles `message` and `split` skills for staged commit workflows
- **`project-advisor`** - Packages repository planning skills, including `next-best-thing`
- **`refactor-tools`** - Packages safe cleanup and refactor skills, including `simplify`
- **`caveman`** - Packages the `toggle` skill for ultra-focused concise-response control with `ultra` and `off` modes, inspired by [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman)

### Available in Claude-Format Marketplaces

- **`commit-tools`** - Bundles `message` and `split` skills for staged commit workflows
- **`project-advisor`** - Packages repository planning skills, including `next-best-thing`
- **`refactor-tools`** - Packages safe cleanup and refactor skills, including `simplify`
- **`block-package-managers`** - Blocks `npm` and `npx` terminal usage and redirects to `pnpm`
- **`lint-and-format`** - Runs `pnpm format` and `pnpm lint` when the agent finishes a coding turn and scripts exist
- **`caveman`** - Provides the `toggle` skill for ultra-focused concise GitHub Copilot chat in VS Code, inspired by [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman)

## Getting Started

### Codex App

This repository includes a repo-scoped Codex marketplace at [`.agents/plugins/marketplace.json`](./.agents/plugins/marketplace.json).

To use it in Codex App:

1. Clone this repository locally.
2. Open the repository in Codex App.
3. Open the plugin directory and look for the marketplace labeled `dhohner/clankers`.
4. Install one of the Codex-native plugins:
   - `project-advisor`
   - `refactor-tools`
   - `caveman`
5. Start using the plugin from chat.

Example prompts after install:

```text
Use the next-best-thing skill to recommend the best next improvement for this repo.
Use the simplify skill to clean up this code without changing behavior.
Use caveman:toggle for ultra-short replies in this chat.
```

Notes:

- The Codex marketplace in this repo currently exposes the plugins that have native `.codex-plugin/plugin.json` manifests.
- In Codex, `caveman` is skill-based and no longer relies on a startup hook.

### Visual Studio Code + GitHub Copilot

VS Code agent plugins are currently in preview. Start with the official docs:

- [Agent plugins in VS Code](https://code.visualstudio.com/docs/copilot/customization/agent-plugins)
- [Agent skills in VS Code](https://code.visualstudio.com/docs/copilot/customization/agent-skills)
- [Custom instructions in VS Code](https://code.visualstudio.com/docs/copilot/customization/custom-instructions)
- [Customize AI in Visual Studio Code](https://code.visualstudio.com/docs/copilot/customization/overview)

1. Enable agent plugins in VS Code:

```json
{
  "chat.plugins.enabled": true
}
```

2. Add this repository as a marketplace in your `settings.json`:

```json
{
  "chat.plugins.marketplaces": [
    "github/awesome-copilot",
    "github/copilot-plugins",
    "dhohner/clankers" // or: "file:///absolute/path/to/clankers"
  ]
}
```

3. Open the Extensions view and search for `@agentPlugins`.
4. Find plugins from the `dhohner/clankers` marketplace and install what you want.
5. Open Copilot Chat and use the installed plugin skills.

### Claude Code

This repository also ships a Claude-format marketplace at [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json).

Add the marketplace from a local checkout:

```bash
/plugin marketplace add /absolute/path/to/clankers
```

Or add it from GitHub:

```bash
/plugin marketplace add dhohner/clankers
```

Install a plugin:

```bash
/plugin install refactor-tools@dhohner-clankers
```

Browse interactively:

```text
/plugin > Discover
```

Example installs:

```bash
/plugin install commit-tools@dhohner-clankers
/plugin install project-advisor@dhohner-clankers
/plugin install refactor-tools@dhohner-clankers
/plugin install block-package-managers@dhohner-clankers
/plugin install lint-and-format@dhohner-clankers
/plugin install caveman-mode@dhohner-clankers
```

## Plugin Structure

Each plugin in this repository is packaged as a small, focused installable unit.

```text
plugin-name/
├── .codex-plugin/
│   └── plugin.json      # Codex metadata (optional, required for Codex marketplace)
├── .claude-plugin/
│   └── plugin.json      # Claude-format metadata (required for Claude/VS Code marketplaces)
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

Legacy `commands/*.md` files still work in some tools, but this repository uses `skills/<name>/SKILL.md` as the default format for reusable skills.

## License

This repository is licensed under MIT. See [LICENSE](./LICENSE).

## Documentation

- Codex marketplace catalog: [`.agents/plugins/marketplace.json`](./.agents/plugins/marketplace.json)
- Claude-format marketplace catalog: [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json)
- Plugin-specific usage and behavior: [`plugins/`](./plugins)
