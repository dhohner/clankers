# Commit Tools Plugin

Provides two user-invoked commit workflow skills for staged changes:

- `message` generates a structured commit message
- `split` suggests how to break staged changes into smaller logical commits

Optional args: ticket, hint, `caveman`, `ultra`.

## Included Skills

### `message`

Turns staged diffs into a ready-to-paste commit message with the expected structure.

Usage:

```text
"/message"
"/message AUTH-789"
"/message ultra"
"/message schema migration"
```

See [the skill definition](./skills/message/SKILL.md) for the exact prompt and output rules.

### `split`

Reviews mixed staged changes and proposes a clean multi-commit breakdown with suggested commit messages.

Usage:

```text
"/split"
"/split caveman"
"/split AUTH-789"
```

See [the skill definition](./skills/split/SKILL.md) for the grouping rules and output format.

## Authors

[dhohner](https://github.com/dhohner)
