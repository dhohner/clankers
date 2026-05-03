# Caveman

Makes replies ultra-short and easier to scan.

## Pi usage

This plugin now exposes a Pi extension, not a Pi skill. Toggling it updates the session system prompt directly, without sending a message to the agent.

Install/load the package, then use:

```text
/caveman
/caveman on
/caveman off
/caveman status
```

A status-bar indicator appears while `ultra` mode is active.

## Other hosts

The `skills/toggle/SKILL.md` file is still kept for hosts that consume skills directly. Pi uses `extensions/caveman-instructions.md` instead.

## Modes

- `ultra` - maximum compression, fragments and arrows
- `off` - normal prose

## Notes

- Applies to the current Pi session.
- `ultra` persists until disabled.
- Does not rewrite code blocks, commands, file paths, exact error text, or other copy-paste-sensitive output.

Inspired by [caveman](https://github.com/JuliusBrussee/caveman) by [Julius Brussee](https://github.com/JuliusBrussee).
