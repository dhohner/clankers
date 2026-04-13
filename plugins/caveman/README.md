# Caveman

Makes replies shorter and easier to scan.

## Use

Run:

```text
/caveman:toggle [ultra|normal|off]
```

If no mode is passed, it defaults to `ultra`.

## Modes

- `ultra` - maximum compression
- `normal` - short, readable fragments
- `off` - normal prose

## Notes

- Applies to the current conversation.
- Does not rewrite code blocks, commands, file paths, exact error text, or commit messages.

## Examples

```text
/caveman:toggle
/caveman:toggle normal
/caveman:toggle off
```

Inspired by [caveman](https://github.com/JuliusBrussee/caveman) by [Julius Brussee](https://github.com/JuliusBrussee).
