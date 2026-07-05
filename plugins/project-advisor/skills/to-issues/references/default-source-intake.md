# Default Source Intake

Use this guide only when `default` mode does not already have a readable PRD file.
Do not read it when the user provides an explicit `prd.yaml` path.
The goal is to resolve ambiguous, missing, `index.html`, or HTML-only sources while preserving the accepted planning artifact.

## Source precedence

Ask the user for the PRD source if it is not already in context and cannot be inferred from a referenced file or directory.
Prefer a PRD file that already exists in the workspace.
When a `to-prd` bundle contains both `prd.yaml` and `index.html`, use `prd.yaml` as the planning source of truth and treat `index.html` as a reviewer-facing companion.
When the user points at `index.html`, first look for a sibling `prd.yaml`.
Use `index.html` only to recover reviewer-facing phrasing or confirm how the accepted bundle presents the material.
If the user only has planning prose or a feature brief instead of a `to-prd` artifact, switch to `fast` mode.

## HTML-only sources

When only HTML is available, extract semantic planning content and ignore presentational markup, inline CSS, metadata pills, comments, and browser-review chrome.
For current `to-prd` HTML, preserve requirement cards rendered as anchors or articles for `REQ-*` elements, including titles, descriptions, validation links, related links, evidence, and validation exceptions.
Use a structured parser when one is readily available.
Otherwise, read the HTML carefully enough to preserve section intent without copying template scaffolding into tickets.

After resolving the source, return to the default-mode `prd.yaml` and slice rules in `SKILL.md`.
