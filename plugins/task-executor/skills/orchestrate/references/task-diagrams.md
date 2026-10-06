# Task change diagrams

For each newly committed task, load the recorded `diagram_skill` through the host's skill mechanism to satisfy `REQ-19`.
Give the skill that task's landed diff and recorded decisions.

Request one SVG or PNG of the changed components and their relations.
Require readable labels, no active content, and no network dependencies.
Supply the report's chosen palette and system fonts as the diagram style to avoid an unrelated branding decision.

## Create and export

Follow the installed skill's creation, validation, and export workflow.
Include HTML source in the run folder when the skill requires it.

Use the task's landed commit and its parent to identify the diff.
Include a resolved or empty candidate's recorded resolution evidence when needed.
Limit the diagram to that task's changed components and relations.

## Validate the asset

Inspect SVG before use for scripts, handlers, foreign objects, external references, and CSS imports or network URLs.
Ask the diagram skill to correct unsafe output before embedding it.
Use only paths under the run folder.
Reject traversal and symlinks escaping it.
Never load an arbitrary path or URL supplied by task or agent text.

Validation is complete when the final SVG or PNG has no active content or network dependencies.
Its path must stay within the run folder.

## Record and embed

Save the asset as `task-<numeric prefix>-change.svg` or `.png` in the run folder.
Before embedding it, record `diagram` in `run.json` as:

```json
{ "path": "<local relative filename>", "alt": "<description of components and relations>", "status": "ready" }
```

Embed exactly one validated SVG or PNG per committed task in its section, using an `img` element with meaningful alternative text.
Reuse the recorded asset on later updates.

The diagram requirement is covered when the safe asset is saved, recorded as `ready`, and embedded in the updated report.

## Failures

On generation or safety failure, preserve the task evidence, complete report, and landed task status.
Record `diagram` as:

```json
{ "path": null, "alt": null, "status": "failed", "failure": "<redacted reason>" }
```

Show the failure under "Unresolved gaps" and save both run files before scheduling another task.
Retry generation before claiming the diagram requirement is covered.
A pending or failed diagram remains uncovered if the session ends before a safe asset is saved.
