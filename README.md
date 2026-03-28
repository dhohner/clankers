# Copilot Plugin Marketplace

Claude-style agent plugin marketplace for GitHub Copilot and Claude Code.

The repository now follows the Anthropic marketplace pattern:

- `.claude-plugin/marketplace.json` defines the marketplace catalog
- `plugins/` contains first-party plugins maintained in this repository
- `external_plugins/` is reserved for future third-party or partner plugins

VS Code Copilot can consume Claude-format plugins and marketplaces, so this layout is intentionally Claude-first while remaining compatible with the VS Code agent plugins preview.

Each installable unit now maps to its own plugin so commands, skills, and hooks can be installed independently.

## Structure

```text
.
├── .claude-plugin/
│   └── marketplace.json
├── plugins/
│   ├── block-package-managers/
│   ├── commit-msg/
│   ├── commit-split/
│   ├── lint-and-format/
│   ├── next-best-thing/
│   └── simplify/
└── external_plugins/
```

## Included Plugins

- `commit-msg`: install only the commit-message command
- `commit-split`: install only the commit-splitting command
- `next-best-thing`: install only the repo-prioritization command
- `simplify`: install only the simplify skill
- `block-package-managers`: install only the `PreToolUse` package-manager guardrail hook
- `lint-and-format`: install only the `PostToolUse` formatting and linting hook

## Use With Claude Code

### Add the marketplace

From a local clone:

```bash
/plugin marketplace add /absolute/path/to/copilot
```

From GitHub:

```bash
/plugin marketplace add dhohner/copilot
```

### Install a plugin

```bash
/plugin install commit-msg@dhohner-copilot
/plugin install commit-split@dhohner-copilot
/plugin install next-best-thing@dhohner-copilot
/plugin install simplify@dhohner-copilot
/plugin install block-package-managers@dhohner-copilot
/plugin install lint-and-format@dhohner-copilot
```

## Use With VS Code Copilot

VS Code auto-detects Claude-format plugins and marketplaces.

### Add this repository as a marketplace

In user or workspace settings:

```json
{
  "chat.plugins.marketplaces": [
    "dhohner/copilot",
    "file:///absolute/path/to/copilot"
  ]
}
```

### Notes for VS Code compatibility

- Claude-format `hooks/hooks.json` is supported by VS Code agent plugins
- VS Code expands `${CLAUDE_PLUGIN_ROOT}` in Claude-format hook commands at runtime
- For hook plugins, guard script execution inside the shell because the current preview can trigger extra hook invocations where `CLAUDE_PLUGIN_ROOT` is unset; without that guard VS Code can show warnings such as `bash: /scripts/<name>.sh: No such file or directory` even though the real hook run succeeds
