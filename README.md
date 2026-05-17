# Clankers

Clankers is a small collection of practical agent plugins for real coding work: tighter planning, safer terminal behavior, cleaner refactors, and faster, easier-to-scan chat.

It targets four hosts today:

- GitHub Copilot in Visual Studio Code
- Claude Code
- Codex App
- Pi Coding Agent

> **⚠️ Important:** Review each plugin before you install it. Plugins in this repository can include prompts, skills, hooks, and shell scripts that run on your machine.

## What You Can Install

The repository packages small, focused plugins instead of one large bundle. Which plugins you can use depends on the host.

### Claude-Format Marketplaces

- `project-advisor` for PRDs, issue slicing, and planning workflows
- `refactor-tools` for safe cleanup and simplification work
- `block-package-managers` to block `npm` and `npx` and steer agents toward `pnpm`
- `security-guard` to block environment dumps and common credential reads
- `lint-and-format` to run lint and format hooks at the end of coding turns
- `caveman` for ultra-concise chat behavior

### Codex App Marketplace

- `project-advisor`
- `refactor-tools`
- `caveman`

### Pi Coding Agent

- `security-guard`
- `block-package-managers`
- `caveman`

See the plugin directories in [plugins](./plugins) for usage details and host-specific behavior.

## Install

### Visual Studio Code + GitHub Copilot

VS Code agent plugins are currently in preview. If you have not used them before, start with the official docs:

- [Agent plugins in VS Code](https://code.visualstudio.com/docs/copilot/customization/agent-plugins)
- [Agent skills in VS Code](https://code.visualstudio.com/docs/copilot/customization/agent-skills)
- [Custom instructions in VS Code](https://code.visualstudio.com/docs/copilot/customization/custom-instructions)
- [Customize AI in Visual Studio Code](https://code.visualstudio.com/docs/copilot/customization/overview)

1. Enable agent plugins in `settings.json`:

```json
{
  "chat.plugins.enabled": true
}
```

2. Add this repository as a marketplace:

```json
{
  "chat.plugins.marketplaces": [
    "github/awesome-copilot",
    "github/copilot-plugins",
    "dhohner/clankers"
  ]
}
```

If you are working from a local checkout instead of GitHub, use `file:///absolute/path/to/clankers`.

3. Open the Extensions view and search for `@agentPlugins`.
4. Install the plugin you want from the `dhohner/clankers` marketplace.
5. Open Copilot Chat and use the installed skills or hooks.

### Claude Code

This repository ships a Claude-format marketplace at [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json).

Add the marketplace:

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

### Codex App

This repository includes a repo-scoped Codex marketplace at [`.agents/plugins/marketplace.json`](./.agents/plugins/marketplace.json).

1. Clone this repository locally.
2. Open the repository in Codex App.
3. Open the plugin directory and look for the marketplace labeled `dhohner/clankers`.
4. Install one of the Codex-native plugins.
5. Start using it from chat.

### Pi Coding Agent

Pi support is aimed at making local coding sessions safer and easier to steer.

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

## Repository Layout

- [`.agents/plugins/marketplace.json`](./.agents/plugins/marketplace.json) is the Codex App marketplace catalog
- [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json) is the Claude-format marketplace catalog used by Claude Code and VS Code agent plugins
- [`plugins/`](./plugins) contains the installable plugin packages

Each plugin is a small installable unit. A typical layout looks like this:

```text
plugin-name/
├── .codex-plugin/
│   └── plugin.json      # Codex metadata when the plugin ships in Codex marketplaces
├── .claude-plugin/
│   └── plugin.json      # Claude-format metadata for Claude/VS Code marketplaces
├── package.json         # Pi package manifest when direct Pi install is supported
├── README.md            # Plugin documentation
├── extensions/
│   └── plugin.ts        # Pi extension entrypoint
├── skills/
│   └── skill-name/
│       └── SKILL.md     # Skill definition
├── hooks/
│   └── hooks.json       # Hook registration
├── .mcp.json            # MCP server configuration
└── scripts/
    └── script.sh        # Hook implementation or helper script
```

## Development

Install dependencies and run the test suite with:

```bash
pnpm install
pnpm test
```

## License

Clankers is licensed under MIT. See [LICENSE](./LICENSE).
