# Default Mode Intake

## Resolve the source

Read an explicitly provided PRD file directly.
When a `to-prd` bundle contains both `prd.yaml` and `index.html`, use `prd.yaml` as the planning source of truth and treat `index.html` as a reviewer-facing companion.
When the user points at `index.html`, look first for a sibling `prd.yaml`.
Use `index.html` only to recover reviewer-facing phrasing or when no structured source exists.
Switch to `brief` mode when the available source is planning prose or a feature brief rather than a packaged PRD.
Ask for a source only when no usable source can be found from the prompt, conversation, referenced path, or workspace.

## Read `prd.yaml`

Check the top-level `status` first: `to-prd` publishes `Accepted` there once a reviewer accepts the PRD.
Any other value means the source can still change, so name that and confirm the user wants tickets from it before slicing.

Use `blocks.requirements` as the primary source for deliverable behavior and its Gherkin as the acceptance-criteria source of truth.
Capture constraints, non-goals, open questions, success measures, validation links, related links, and traceability whenever they affect a ticket or slice boundary.
Treat `blocks.testing_strategy` as validation traceability; derive delivery work from requirements rather than creating separate testing slices.
For infrastructure work, preserve binding technologies, architecture decisions, security boundaries, operational requirements, and required evidence.

## Recover HTML-only planning

Extract semantic planning content while leaving presentational markup, inline CSS, metadata pills, comments, and browser-review chrome out of the ledger.
For current `to-prd` HTML, preserve `REQ-*` requirement cards and their titles, descriptions, validation links, related links, evidence, and validation exceptions.
Use a structured parser when readily available; otherwise inspect the HTML closely enough to preserve section intent.
