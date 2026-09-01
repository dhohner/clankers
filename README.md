# Clankers

Clankers publishes coding-agent plugins for product planning, code refactoring, command safety, and Pi response styles.
The plugins support Claude Code, Codex App, and Pi Coding Agent.

> Review each plugin before installation.
> A plugin can add prompts, skills, hooks, extensions, and shell scripts that run on your machine.

## Plugins

| Plugin | Purpose | Claude Code | Codex App | Pi |
| --- | --- | --- | --- | --- |
| [`project-advisor`](./plugins/project-advisor) | Recommends product work, writes PRDs, and converts accepted PRDs into Jira issues or coding-agent tasks. | Yes | Yes | No |
| [`refactor-tools`](./plugins/refactor-tools) | Simplifies code, tightens AI-generated prose without changing meaning, and reviews changes for quality, security, and maintainability. | Yes | Yes | No |
| [`agent-hooks`](./plugins/agent-hooks) | Blocks environment dumps and common credential reads through a Claude-format hook. | Yes | No | No |
| [`security-guard`](./plugins/security-guard) | Blocks environment dumps and common credential reads, and asks Pi users to approve destructive commands. | No | No | Yes |
| [`output-styles`](./plugins/output-styles) | Selects a Pi response style at startup or during a session. | No | No | Yes |

Each plugin directory documents its commands, behavior, requirements, and limits.

## Install

### Claude Code

Add the marketplace.

```text
/plugin marketplace add dhohner/clankers
```

Install a plugin by name.

```text
/plugin install project-advisor@dhohner-clankers
/plugin install refactor-tools@dhohner-clankers
/plugin install agent-hooks@dhohner-clankers
```

Run the following command to browse the marketplace instead.

```text
/plugin > Discover
```

### Codex App

The Codex marketplace uses local plugin paths, so install it from a local checkout.

1. Clone this repository and open it in Codex App.
2. Open the plugin directory.
3. Select the marketplace named `dhohner/clankers`.
4. Install `project-advisor` or `refactor-tools`.

### Pi Coding Agent

Pi requires version 0.84.2 or later for the full bundle.
Install dependencies in a local checkout before installing `output-styles`.

```bash
pnpm install
```

Install both Pi plugins.

```bash
pi install ./
```

Install one Pi plugin instead.

```bash
pi install ./plugins/output-styles
pi install ./plugins/security-guard
```

Add `-l` to any Pi install command to write a project-local entry to `.pi/settings.json`.

```bash
pi install -l ./
```

## Marketplace files

- [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json) defines the Claude Code marketplace.
- [`.agents/plugins/marketplace.json`](./.agents/plugins/marketplace.json) defines the repo-scoped Codex App marketplace.
- [`package.json`](./package.json) defines the Pi bundle.

## License

Clankers uses the [MIT License](./LICENSE).
