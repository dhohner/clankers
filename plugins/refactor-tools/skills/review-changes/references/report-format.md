# Report format

Rank findings by severity, then by concrete cost.
Report every blocker in full, even beyond five findings.
Fill the remaining slots within five full findings with follow-ups and nits.
List further non-blocking findings on one line each under `Also noted`.

Report concrete, checkable costs, or cite the violated mandatory rule when no concrete impact is established.
Include each reviewer verification gap in the affected finding's `Evidence` line.
Use `Remaining risk` for untested behavior, scope limitations, and unresolved guide conflicts.
State successful checks against supplied requirements in `Result`.

Omit empty sections.
If there are no findings, say so and retain the validation section.
Retain scores only for a nonempty review scope.

````md
## Result

<Two or three sentences about the change and merge readiness.>

Scope: <source and revision or file set>

| Dimension | Score | Why | Confidence | Coverage limits |
| --- | --- | --- | --- | --- |
| Quality | N | <cause or "no finding"> | high/medium/low | <limits or "none identified"> |
| Security | N | | | |
| Simplicity | N | | | |
| Robustness | N | | | |
| Scalability | N | | | |
| Maintainability | N | | | |

## Findings

### 1. <short title> [dimension, severity]

- Where: `path/to/file:line`
- Cost: <concrete failure and trigger, or violated mandatory rule with no established impact>
- Evidence: <Executed | Static trace | Hypothesis> - <support and limits>.
- Fix: <concrete change>

## Also noted

- <finding and severity> - `path/to/file:line` - <evidence type, support, and limits>.

## Files reviewed

- `path/to/file` (+N/-N) - <change summary>
- Dropped: `path` - <reason>

## Validation observed

- <validation category>: <command reference> in `<directory>` -> <result and selected file/test counts>.
- Snapshot: <source, included dependencies, and mismatches>.
- Negative control: <baseline pass and targeted failure, unexpected outcome, or skip reason>.
- Preservation: <baseline comparison and any differences>.

```sh
<executed commands>
```

## Not run

- <check or command reference> - <reason>.

## Remaining risk

- <untested behavior, scope limitation, or unresolved guide conflict>
````
