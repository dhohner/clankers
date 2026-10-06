# HTML run report

Write `report.html` directly in the run folder beside `run.json` to satisfy `REQ-18`.
Embed CSS and add no report generator script.
Use the adjacent `run.json` for every displayed value.

## Contents

- [Recording and updates](#recording-and-updates)
- [Required page sections](#required-page-sections)
- [Offline style and text safety](#offline-style-and-text-safety)
- [Chat summary](#chat-summary)

## Recording and updates

Preserve every existing run field and recording rule.

### Prepare records

Detect the optional diagram skill once from the current session's installed and enabled skill catalog.
Recognize `diagram-design:diagram-design` and `diagram-design`, using the host's exposed catalog name.
Record that name or `null` in `diagram_skill`.
A file on disk alone does not establish availability.

Add `title`, `commit_subject`, and `diagram` to each task record without replacing existing fields.
Record the task's heading as `title` during preparation.
Initialize `commit_subject` and `diagram` to `null`.

Write the initial checkpoint before scheduling, even when every task is skipped.
Preparation is complete when both run files exist and every selected task has these fields.

### Coverage

Before a task starts, copy every `Required behavior` and `Acceptance` item verbatim into `coverage`.
Preserve each item's identity so the page accounts for every item.
Use `gap` with `Not reported` evidence until observed coverage or a blocker is recorded.

Before saving a checkpoint, compare every task that ran against these source contract items.
Retain every coverage entry.
Add each missing contract item verbatim as `gap` with evidence `Not reported` and an unresolved disposition.

Keep accepted gaps classified as gaps.
Preserve `failed` and `not_run` validation results when reporting coverage.
Infer coverage only from observed evidence, never from a commit or task status.
Coverage is recorded when every contract item has a classification and evidence or the `Not reported` marker.

### Checkpoints

After every task status change, write a checkpoint before scheduling another task or asking the user.
A waiting checkpoint retains its question and uncovered items even if the user never answers.

Immediately after landing, record the integration commit's hash and subject, including `commit_subject`.
When `diagram_skill` is nonnull, set `diagram` to status `pending` with `null` values for `path` and `alt`.
Show the pending diagram evidence under "Unresolved gaps".
Write this `done` checkpoint before task cleanup or diagram generation.

After diagram generation, write another checkpoint before scheduling another task.
After cleanup changes recorded paths or the integration branch, refresh the report from the saved run file.
Retain the report and last completed checkpoint through cleanup and session termination.

### Write a checkpoint

1. Prepare the complete run data and page.
2. Set the new `updated_at` and replace `run.json` through a temporary file in the same run folder.
3. Update the page from that saved JSON and replace `report.html` through a temporary file in the same run folder.

The two replacements run sequentially, not as one transaction.
A checkpoint is complete when both files describe the saved run's `updated_at` and task statuses.

If report writing fails, retain the saved run file and previous complete report.
Report the failure and its paths, identifying the page as an older checkpoint.
Retry the report before scheduling or asking.

## Required page sections

Use this section order in every run.
Keep empty required sections visible.
Write `None` for a recorded empty list and `Not reported` for missing evidence or unknown settings.

### Run header

Show:

- Task directory and selected range, using `All tasks` when `range` is `null`.
- Start branch and start commit, using `Detached HEAD` when the branch is `null`.
- Integration branch, using `None` when it is `null`.
- Merge command with instructions to run it from the start branch, using `Unavailable` when no integration branch remains.
- Concurrency limit and verifier pass limit.
- Start and update times from `started_at` and `updated_at`.

Derive the merge command from the recorded integration branch using shell quoting.
Omit the command when the branch is absent.

### Status table

Use a table with a caption and column headers marked `scope="col"`.
Include exactly one row per selected task in task order, including `skipped`, `queued`, and `not_started` tasks.
Show the task file, escaped title, status word, and landed commit hash or `None`.

Link rows for tasks that ran to their task sections.
Use `task-<numeric prefix>` as each task section's ID.

### Task sections

Write one section for every task that ran, including tasks currently `running`, `waiting`, `done`, or `ended`.
Tasks that never started have only their status table rows.
Use these headings and labels in each task section:

- Status: the recorded run status, including the recorded waiting question or ended reason when present.
- Commit: the landed hash and subject, or `None` before landing.
- Coverage: every `Required behavior` and `Acceptance` item, its classification, and its observed evidence.
- Decisions: the full decision ledger.
- Accepted gaps: accepted dispositions and `accepted_gaps`, with item, location, evidence, and the user's recorded answer when available.
  - Present matching entries once, preserving all details.
  - Include accepted landing validation failures and issues from resolution records.
- Rejected gaps: rejected gaps and every recorded boundary rationale.
- Unresolved gaps: remaining gaps and missing evidence, including gaps in a waiting payload or ended record.
  - An absent or unrecognized disposition remains unresolved.
  - Retain fixed and settled gaps with their disposition and rationale in an additional "Resolved gaps" list.
- Blocked behavior: every recorded blocker and the behavior it excludes.
- Model: explicitly label selected and used values.
- Effort: explicitly label selected and used values.
- Model choice: the recorded reason.

Retain recorded platform limits and conflict resolution evidence in additional sections when present.

### Change diagrams

When `diagram_skill` is `null`, omit diagrams, diagram headings, placeholders, and absence messages.
Tasks without a landed commit receive no diagram.

## Offline style and text safety

Use a light background, dark text, system fonts, a restrained accent color, and visible status words.
Distinguish the run header, status table, and task sections with spacing and borders.
Allow long hashes, paths, and evidence to wrap.

Let wide tables scroll within their container on narrow screens.
Preserve significant whitespace in copied text with `white-space: pre-wrap`.

Use semantic headings, sufficient contrast, and table headers.
Pair status colors with visible status words.

The page opens directly from a local file without JavaScript or network requests.
Use no remote fonts, stylesheets, or images.
Keep the orchestrator's CSS in one static `style` element.

Treat task text, agent messages, commit text, ledger entries, evidence, and diagram labels as untrusted data.
Escape `&`, `<`, `>`, `"`, and `'` before inserting copied text into HTML text or attribute values.
Use text nodes, never copied markup or Markdown rendered as raw HTML.

Keep untrusted values out of tag names, CSS, attribute names, IDs, and executable contexts.
Use only controlled local links, validated diagram paths, and IDs derived from validated numeric prefixes.
Escape alternative text and titles too.

## Chat summary

Keep every existing chat summary item.
Also name the `report.html` path to satisfy `REQ-20`.
Include that path for stopped, waiting, and completed runs.
