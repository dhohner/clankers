# Source map

The source map records the disposition of every source item, so a reviewer can check that the task set covers the PRD.
Write it to `<destination>/source-map-<slug>.md`, where `<slug>` is the `slug` of the PRD.
When the file exists from an earlier run on the same PRD, update its rows and keep the rows of kept tasks.

## Format

Write one Markdown table with this header and one row per source item:

```markdown
# Source map: <PRD title>

| Source item | Disposition | Tasks | Note |
| --- | --- | --- | --- |
| REQ-01 | implementation | `01-add-book-entries.md` | |
| TEST-01 | validation | `01-add-book-entries.md` | |
| NODE-01 | implementation | `02-tag-entries.md` | Lowercase tags and matching without regard to case. |
| RISK-01 | blocker | `03-list-entries-by-tag.md` | The sort order for equal ids needs a product decision. |
| QUESTION-01 | no work | | The question asks about a later release. |
| scope.out: Sync between machines | no work | | Excluded from this release. |
```

- `Source item` holds the `id` of an item, such as `REQ-01`, or a short label for an item without an `id`, such as a scope entry, a constraint, or a success measure.
- `Disposition` is `implementation`, `validation`, `blocker`, or `no work`.
- `Tasks` names the task files that carry the item, separated by commas.
- `Note` gives the reason for a `blocker` or `no work` disposition, and is optional for the other dispositions.

## Rules

- Give every `REQ`, `DEC`, `RISK`, `QUESTION`, `TEST`, and `NODE` id in the PRD exactly one row.
- Add a row for each item without an `id` that affects implementation.
- Name at least one task for an `implementation` or a `validation` item.
- Name a task for a `blocker` item only when that task has a `Blockers` line for it.
- Make every task of this run appear in at least one row.
- Keep pipe characters out of the cells.
