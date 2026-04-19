# Caveman

Makes replies ultra-short and easier to scan.

## Use

Run:

```text
/caveman:toggle [ultra|off]
```

Include the first task in the same message:

```text
/caveman:toggle why is this component re-rendering?
/caveman:toggle off explain that again in normal prose
```

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
/caveman:toggle why did my test fail?
/caveman:toggle off
```

Inspired by [caveman](https://github.com/JuliusBrussee/caveman) by [Julius Brussee](https://github.com/JuliusBrussee).
