# Clankers

Clankers provides plugins for coding agents that help with product planning, task implementation, code refactoring, commit messages, prose editing, command safety, sleep status, and Pi response styles.
The plugins support Claude Code, Codex App and CLI, and Pi Coding Agent.

Development happens in [`clankers-dev`](https://github.com/dhohner/clankers-dev).
The public `clankers` repository contains generated distributions.
See the [release instructions](https://github.com/dhohner/clankers-dev/blob/main/docs/releases.md) for setup, local previews, and publishing.

> Review each plugin before installation.
> A plugin can add prompts, skills, hooks, extensions, and shell scripts that run on your machine.

## Plugins

| Plugin | Purpose | Claude Code | Codex App / CLI | Pi |
| --- | --- | --- | --- | --- |
| [`project-advisor`](./plugins/project-advisor) | Recommends product work, writes PRDs, and converts accepted PRDs into Jira issues or tasks for coding agents. | Yes | Yes | No |
| [`task-executor`](./plugins/task-executor) | Implements task files for coding agents and standalone changes using TDD, with independent verification of requirements. | Yes | Yes | No |
| [`refactor-tools`](./plugins/refactor-tools) | Simplifies code and reviews changes for quality, security, and maintainability. | Yes | Yes | No |
| [`scribe`](./plugins/scribe) | Writes commit messages that explain why staged changes were made and edits AI prose for clarity without changing its meaning. | Yes | Yes | No |
| [`insomniac`](./plugins/insomniac) | Shows the model, context usage, and session sleep state in a Pi footer and Claude Code status line. | Yes | No | Yes |
| [`security-guard`](./plugins/security-guard) | Blocks environment dumps and common credential reads, and asks Pi users to approve destructive commands. | No | No | Yes |
| [`output-styles`](./plugins/output-styles) | Selects a Pi response style at startup or during a session. | No | No | Yes |

See each plugin directory for its commands, behavior, requirements, and limits.

## Install

### Claude Code

Add the marketplace.

```text
/plugin marketplace add dhohner/clankers
```

Install a plugin by name.

```text
/plugin install project-advisor@clankers
/plugin install task-executor@clankers
/plugin install refactor-tools@clankers
/plugin install scribe@clankers
/plugin install insomniac@clankers
```

To browse the marketplace, run:

```text
/plugin > Discover
```

### Codex App and CLI

With Codex CLI installed, add the marketplace directly from GitHub by running this in a terminal, following [OpenAI's Git marketplace instructions](https://developers.openai.com/plugins/build/plugins#add-a-marketplace-from-the-cli):

```bash
codex plugin marketplace add https://github.com/dhohner/clankers.git --sparse .agents/plugins --sparse plugins
```

Both sparse paths are required: `.agents/plugins` contains the marketplace catalog, and `plugins` contains the plugin manifests and skills it references.
Then open the Plugins Directory in Codex App, select `dhohner/clankers`, and install `project-advisor`, `task-executor`, `refactor-tools`, or `scribe`.
You can also install a plugin from the CLI:

```bash
codex plugin add project-advisor@clankers
```

To refresh the marketplace from Git later, run `codex plugin marketplace upgrade clankers`.

You can also use a local checkout: run `codex plugin marketplace add /absolute/path/to/clankers`, then install a plugin from Codex App or the CLI.

### Pi Coding Agent

The Pi bundle supports Pi 1.0.4.
Install the bundled Pi plugins, `output-styles`, `security-guard`, `insomniac`, and `task-executor`, from Git:

```bash
pi install git:github.com/dhohner/clankers
```

For a local checkout, install dependencies before installing the Pi plugins.

```bash
pnpm install
```

Install the bundled Pi plugins from the checkout.

```bash
pi install ./
```

Install one Pi plugin instead.

```bash
pi install ./plugins/output-styles
pi install ./plugins/security-guard
pi install ./plugins/insomniac
pi install ./plugins/task-executor
```

Task executor includes the `implement` and `tdd` skills.

Add `-l` to any Pi install command to write an entry to the project's `.pi/settings.json`.

```bash
pi install -l ./
```

## Marketplace files

- [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json) defines the Claude Code marketplace.
- [`.agents/plugins/marketplace.json`](./.agents/plugins/marketplace.json) defines the Codex marketplace.
  Codex can read it from a local checkout or a marketplace source in Git.
- [`package.json`](./package.json) defines the Pi bundle.

## License

Clankers uses the [MIT License](./LICENSE).
