---
name: to-issues
description: Convert accepted or settled PRDs, to-prd prd.yaml bundles, specs, feature briefs, or rough planning prose into German Jira-ready markdown issues using tracer-bullet vertical slices. Use this skill whenever the user asks to turn planning material into Jira tickets, issues, work items, action items, implementation slices, or engineer-facing backlog, including brief-mode requests from incomplete prose. Do not use to write PRDs or create live tracker items. Output copyable behavior-focused markdown, not implementation checklists.
argument-hint: "[default|brief]"
---

# PRD to Issues

Turn settled product planning into independently implementable Jira-ready markdown files for experienced human developers.
Do not create or modify Jira issues, GitHub issues, or other external tracker items.
The default output directory is `action-items/jira-issues/`.

Ticket content uses German as the base language and must follow `references/jira-issue-template.md` exactly.
Do not change the ticket HTML structure, panel classes, inline styles, label order, notes-panel shape, or German Gherkin syntax unless the user explicitly requests another format.

## Runbook

1. Select `default` or `brief` mode.
2. Load only references needed for the current phase, and read each reference once per invocation.
3. Resolve the source.
4. Draft thin vertical slices with traceability, AFK or HITL type, and real dependencies only.
5. Apply the default-mode review gate unless the user already approved the breakdown or asked you to assume approval.
6. Read the ticket template and writing checklist before drafting files.
7. Create one Jira-ready markdown file per approved slice.
8. Summarize created files, slice order, material assumptions, and open questions.

## Mode selection

Interpret the first argument as the mode when it is present.
Valid values are `default` and `brief`.
If no argument is provided, choose from the source material.

Use `default` for a full PRD, especially a `to-prd` bundle with `prd.yaml`.
Use `brief` when the user explicitly says `brief`, provides a feature brief, rough planning prose, a feature description, or any source that is not a packaged PRD artifact.
Brief mode starts from the user's input, prior conversation, and referenced files.
Do not require, request, or synthesize a full PRD in brief mode.

## Source handling

### Default mode

If the user provides a readable PRD file, especially `prd.yaml`, read that file directly.
With an explicit `prd.yaml` and an approved or assumed-approved breakdown, use the short path: read PRD, read the slice checklist, draft slices, load writing references, write files.
Do not ask for the source, read a sibling `index.html`, load default source-resolution guidance, or perform broad repository exploration when an explicit `prd.yaml` is available.
Read [references/default-source-intake.md](./references/default-source-intake.md) only when the PRD source is missing, ambiguous, points at `index.html`, or HTML-only.
If the source is planning prose or a feature brief instead of a PRD artifact, switch to `brief` mode.

For `prd.yaml`, preserve structured planning data such as constraints, non-goals, open questions, success measures, and traceability.
Use `blocks.requirements` as the primary source for deliverable behavior.
Use `blocks.testing_strategy` and validation links as validation traceability, not separate implementation tasks.
`blocks.user_stories` may be absent.
Group related requirements into vertical slices when they produce one demoable outcome.
Do not create one Jira issue per requirement by default.

### Brief mode

Before the first serious question round, read [references/brief-mode-intake.md](./references/brief-mode-intake.md).
Extract settled facts before asking anything new.
Ask only for missing information that materially changes scope, behavior, dependencies, acceptance criteria, ownership, rollout risk, or the slice breakdown.
Batch related questions into one round.
Use `ask_question` when available, with predefined options when useful.
If no interactive question tool exists, ask concise chat questions.

If a plausible answer would change the slices, ask before drafting.
If clarification is impossible and the ticket set cannot stay stable without that answer, stop after surfacing the smallest blocking question.
If a ticket can remain stable, record uncertainty as an assumption or open question instead of silently choosing an interpretation.
Do not invent product rules, validation behavior, naming rules, deduplication behavior, permission nuances, quotas, recovery flows, or edge cases just to make tickets feel complete.

## Codebase context

Inspect the repository only when it can materially improve product terms, existing workflow names, system boundaries, role names, user-facing labels, or non-obvious constraints.
Keep exploration bounded.
Do not run a general code audit.
Do not turn implementation details found in the repo into required work unless the source context supports them.

## Design vertical slices

Before proposing or writing the slice breakdown, read [references/slice-design-checklist.md](./references/slice-design-checklist.md).
Create thin tracer-bullet slices with demoable outcomes.
Prefer product outcomes over engineering layers, and avoid tickets that only prepare an API, database, UI, migration, service, test suite, or architecture foundation.

Classify each slice as `AFK` or `HITL` using the checklist.
Default to `AFK` unless a product, design, architecture, policy, or compliance decision is materially required.
Add only real dependencies, not decorative implementation-order chains.

## Review gate

In `default` mode, present the proposed breakdown before creating files unless the user explicitly says the breakdown is already approved or asks you to assume approval.
For each slice, show:

- **Title**: short descriptive name
- **Type**: `HITL` or `AFK`
- **Blocked by**: required predecessor slices, if any
- **Requirements covered**: PRD requirement IDs and source goals addressed

Ask whether the granularity, dependencies, and HITL or AFK labels look right.
Do not create files in default mode until the user approves the breakdown or has already told you to assume approval.

In `brief` mode, skip the full review loop unless the source leaves multiple plausible breakdowns and choosing the wrong one would materially change the Jira files.
If that happens, ask the smallest useful question and then continue.

## Create Jira-ready markdown files

Before drafting files, read:

- [references/ticket-writing-checklist.md](./references/ticket-writing-checklist.md)
- [references/jira-issue-template.md](./references/jira-issue-template.md)
- [references/example-ticket.md](./references/example-ticket.md), only when you need a tone or detail-level sample

Create files in `action-items/jira-issues/` unless the user requests another location.
Create one markdown file per approved slice, in dependency order.
Use predictable filenames such as `01-short-slice-title.md`, `02-next-slice-title.md`, and so on.

Every issue must follow the exact raw HTML structure and template rules in [references/jira-issue-template.md](./references/jira-issue-template.md).
Use the Jira-compatible panels, inline styles, German labels, German Gherkin keywords, and notes-panel structure from the template.
Always include the notes panel.
Within the notes list, include only entries that carry real information.
Omit empty entries rather than writing placeholders such as `Keine`.

If the PRD does not already provide the user story in `Als ... moechte ich ... damit ...` form, derive it from the slice intent.
Acceptance criteria must be named scenarios inside dashed panels, not a plain checklist.
Each scenario must describe externally verifiable behavior, outcomes, and constraints.
Prefer first-person participant phrasing such as `ich sehe`, `ich erhalte`, `ich wähle`, `ich öffne`, or `ich befinde mich` over generic third-person phrasing when it expresses the same behavior.

Apply these core rules before saving each file:

- Write for experienced human developers by describing behavior and constraints, not implementation plans.
- Treat implementation ideas as context; convert them into user-visible behavior or domain constraints.
- Keep internal code artifacts out of scenarios.
- In `brief` mode, prefer source fidelity over false completeness.
- Ask, omit, or record uncertainty instead of inventing product rules.
- Keep `Technische Hinweise` brief, decision-relevant, and limited to non-obvious source-backed constraints.
- Use German as the base language while keeping established English product or technical terms when clearer.

## Final response

After writing the files, summarize the created filenames, intended slice order, and any material assumptions or open questions.
Make clear that the files are Jira-ready markdown, not live Jira tickets.
