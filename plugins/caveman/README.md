# Caveman

Makes replies ultra-short and easier to scan.

## Use

Run:

```text
/caveman:toggle [ultra|off]
```

If no mode is passed, it defaults to `ultra`.
`normal` still works as a compatibility alias for `off`.

## Modes

- `ultra` - maximum compression, fragments and arrows
- `off` - normal prose

## Notes

- Applies to the current conversation.
- `ultra` persists until disabled.
- Does not rewrite code blocks, commands, file paths, exact error text, or other copy-paste-sensitive output.

## Examples

```text
/caveman:toggle
/caveman:toggle off
```

Inspired by [caveman](https://github.com/JuliusBrussee/caveman) by [Julius Brussee](https://github.com/JuliusBrussee).
