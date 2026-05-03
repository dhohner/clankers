# Clankers

Clankers is a small collection of practical agent plugins for real coding work: tighter planning, safer terminal behavior, cleaner refactors, and faster, easier-to-scan chat.

It is built for GitHub Copilot in Visual Studio Code, Claude Code, Codex App, and Pi Coding Agent.

> **⚠️ Important:** Make sure you trust a plugin before installing, updating, or using it. Plugins in this repository can include prompts, skills, hooks, and shell scripts that run on your machine. Review each plugin's README and source before use.

Tools:

- GitHub Copilot in Visual Studio Code
- Claude Code (untested)
- Codex App
- Pi Coding Agent

## Structure

- **`/.agents/plugins/marketplace.json`** - Codex App marketplace catalog for this repository
- **`/.claude-plugin/marketplace.json`** - Claude-format marketplace catalog used by Claude Code and VS Code agent plugins
- **`/plugins`** - plugins developed and maintained in this repository

## Included Plugins

### Available in Codex App Marketplace

- **`project-advisor`** - Packages product-planning skills, including `next-best-thing`, `write-a-prd`, and `prd-to-issues`
- **`refactor-tools`** - Packages safe cleanup and refactor skills, including `simplify`
- **`caveman`** - Packages the `toggle` skill for ultra-focused concise-response control with `ultra` and `off` modes, inspired by [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman)

### Available in Claude-Format Marketplaces

- **`project-advisor`** - Packages product-planning skills, including `next-best-thing`, `write-a-prd`, and `prd-to-issues`
- **`refactor-tools`** - Packages safe cleanup and refactor skills, including `simplify`
- **`block-package-managers`** - Blocks `npm` and `npx` terminal usage and redirects to `pnpm`
- **`security-guard`** - Blocks tool calls that try to print the current user environment or read common local credentials
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

Add the marketplace from Github:

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

### Pi Coding Agent

Pi support in this repository is aimed at making local coding sessions safer and easier to steer.

Available Pi extensions:

- **`security-guard`** - blocks risky `bash`, `read`, and user shell commands that try to print env data or read common local credentials
- **`block-package-managers`** - blocks `npm` and `npx` in Pi `bash` tool calls and user shell commands, and points the agent toward `pnpm`
- **`caveman`** - adds a session-level response mode for ultra-short, scan-friendly replies

Install the full Pi bundle from this repo:

```bash
pi install ./
```

For project-local installation that writes to `.pi/settings.json`:

```bash
pi install -l ./
```

Install individual Pi plugins from a local checkout:

```bash
pi install ./plugins/security-guard
pi install ./plugins/block-package-managers
pi install ./plugins/caveman
```

For project-local installation that writes to `.pi/settings.json`:

```bash
pi install -l ./plugins/security-guard
pi install -l ./plugins/block-package-managers
pi install -l ./plugins/caveman
```

## Tests

```bash
pnpm install
pnpm test
```

## Plugin Structure

Each plugin in this repository is packaged as a small, focused installable unit. The goal is simple: install just the behavior you want, in the host you already use.

```text
plugin-name/
├── .codex-plugin/
│   └── plugin.json      # Codex metadata (optional, required for Codex marketplace)
├── .claude-plugin/
│   └── plugin.json      # Claude-format metadata (required for Claude/VS Code marketplaces)
├── package.json         # Pi package manifest (optional, required for direct Pi install)
├── README.md            # Plugin documentation
├── extensions/
│   └── plugin.ts        # Pi extension entrypoint (optional)
├── skills/
│   └── skill-name/
│       └── SKILL.md     # Skill definition (optional, preferred)
├── hooks/
│   └── hooks.json       # Hook registration (optional)
├── .mcp.json            # MCP server configuration (optional)
└── scripts/
    └── script.sh        # Hook implementation or helper script (optional)
```

## License

This repository is licensed under MIT. See [LICENSE](./LICENSE).

## Documentation

- Codex marketplace catalog: [`.agents/plugins/marketplace.json`](./.agents/plugins/marketplace.json)
- Claude-format marketplace catalog: [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json)
- Plugin-specific usage and behavior: [`plugins/`](./plugins)
