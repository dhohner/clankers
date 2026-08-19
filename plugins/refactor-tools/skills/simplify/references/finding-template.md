# Finding Format

Format every finding as follows.
Return an empty list when none are meaningful.

```md
- **file**: `path/to/file`
  **line**: L or L-L range
  **issue**: one-sentence description of the problem
  **suggestion**: concrete code change or refactor to apply
  **confidence**: high | medium | low
  **risk**: safe | caution | risky
```

`safe` preserves behavior.
`caution` may change behavior.
`risky` changes public APIs or semantics.
