---
name: to-issues
description: >-
  Convert PRDs, accepted to-prd prd.yaml bundles, specs, feature briefs, rough planning prose, or Gherkin scenarios into German Jira-ready markdown issues using tracer-bullet vertical slices.
  Use whenever the user asks to turn product requirements or planning material into Jira tickets, issues, work items, backlog items, action items, implementation tickets, implementation slices, or engineer-facing delivery stories, including brief requests from incomplete prose.
  Do not use it to write PRDs or create live tracker items.
  Output copyable behavior-focused markdown, not implementation checklists.
argument-hint: "[default|brief]"
---

# PRD to Issues

Convert settled product planning into independently implementable Jira-ready markdown stories for experienced human developers.
Do not create or modify Jira issues, GitHub issues, or other external tracker items.
Create copyable markdown files in `action-items/jira-issues/` unless the user requests another location.

Generated issues use German as the base language and follow `references/jira-issue-template.md` exactly.
Write each story as a concise product specification for senior engineers: outcome-driven, self-contained, explicit about acceptance boundaries, and clear about why the behavior matters.
Avoid PM theater, stakeholder prose, roadmap language, and task-manager instructions.
Keep established English product, UI, and technical terms when they are clearer or source-backed.

## Reference loading

Use this file as the router and load deeper guidance only when the phase needs it.
Do not pre-load every reference.

- `references/default-source-intake.md`: use only when default mode has no readable PRD, points at `index.html`, or is HTML-only.
- `references/brief-mode-intake.md`: use before asking questions in brief mode.
- `references/slice-design-checklist.md`: use before proposing or writing slices.
- `references/ticket-writing-checklist.md`, `references/jira-issue-template.md`, and `references/example-ticket.md`: use before drafting Jira files.

## Workflow

1. Select `default` or `brief` mode.
2. Resolve the source with the lightest viable intake path.
3. Extract source-backed behavior, constraints, dependencies, assumptions, risks, open questions, and traceability.
4. Inspect repository context only when source terminology, existing workflow names, role names, user-facing labels, or non-obvious constraints are ambiguous or explicitly referenced.
5. Create thin vertical slices with demoable outcomes and real dependencies.
6. In default mode, get breakdown approval unless approval is already given or explicitly assumed.
7. Create one Jira-ready markdown file per approved slice.
8. Run the final quality gate before saving or responding.
9. Summarize created files, intended slice order, material assumptions, and open questions.

## Mode and source rules

Interpret the first argument as the mode when present.
Valid values are `default` and `brief`.
If no argument is provided, choose from the source material.

Use `default` for a full PRD, especially a `to-prd` bundle with `prd.yaml`.
Use `brief` for explicit brief requests, feature briefs, rough planning prose, feature descriptions, or any source that is not a packaged PRD artifact.
Brief mode starts from the user's input, prior conversation, and referenced files.
Do not require, request, or synthesize a full PRD in brief mode.
Prefer stable assumptions and open questions over trying to reconstruct a full PRD.

Treat phrases like `assume the breakdown is approved`, `write the files directly`, `no review needed`, `skip review`, or `assume approval` as approval to skip the default-mode breakdown review.
If the user asks for a proposed breakdown, review, or confirmation, do not skip it.

### Default mode

If the user provides a readable PRD file, especially `prd.yaml`, read that file directly.
With an explicit `prd.yaml` and an approved or assumed-approved breakdown, use the short path: read the PRD, read the slice checklist, draft slices, load writing references, and write files.
Do not ask for the source, read a sibling `index.html`, load default source-resolution guidance, perform broad repository exploration, or start a review loop when the user has already authorized direct writing.

For `prd.yaml`, use `blocks.requirements` as the primary source for deliverable behavior.
Use Gherkin in requirements as the acceptance-criteria source of truth.
Preserve constraints, non-goals, open questions, success measures, validation links, and traceability when they affect tickets.
Use `blocks.testing_strategy` as validation traceability, not as separate implementation work.
Group related requirements into vertical slices when they produce one demoable outcome.
Do not create one Jira issue per requirement by default.

If the source is missing, ambiguous, `index.html`, or HTML-only, use the default source-intake reference.
If the source is planning prose or a feature brief instead of a PRD artifact, switch to `brief` mode.

### Brief mode

Extract settled facts before asking anything new.
Ask only for missing information that materially changes scope, behavior, dependencies, acceptance criteria, ownership, rollout risk, or slice breakdown.
Batch related questions into one round.
Use `ask_question` when available, with predefined options when useful.
If no interactive question tool exists, ask concise chat questions.

If clarification is impossible and the ticket set cannot stay stable without that answer, stop after surfacing the smallest blocking question.
If a ticket can remain stable, record uncertainty as an assumption or open question instead of silently choosing an interpretation.
Skip the full review loop unless multiple plausible breakdowns would materially change the Jira files.

## Product guardrails

Use only behavior, constraints, dependencies, assumptions, risks, and open questions that are explicit or directly implied by the source.
Treat Gherkin scenarios as the source of truth for functional behavior and acceptance criteria.
Describe what the system should do and why it matters, not how engineering should build it.
Make every ticket self-contained for someone who has not read the PRD, brief, or planning artifact.
Do not refer to the source PRD, brief, planning artifact, or unavailable source sections from ticket content.

Keep repository exploration optional and bounded.
Use it only to confirm product terminology, workflow names, system boundaries, role names, user-facing labels, and non-obvious constraints.
Do not turn repository implementation details into required work unless the source supports them.

Trust the engineering audience to choose the implementation approach unless the source contains a real product, compliance, architecture, or integration constraint.
Use precise, confident, collaborative language rather than instructional, managerial, or stakeholder-facing prose.

## Slice design and review

Create thin tracer-bullet slices with demoable outcomes.
Organize slices around user-visible or system-verifiable outcomes, not around engineering layers.
Use engineering boundaries only when they improve quality, simplicity, robustness, scalability, or long-term maintainability without turning the ticket into an implementation checklist.
Avoid tickets that only prepare an API, database, UI, migration, service, test suite, or architecture foundation.

Read `references/slice-design-checklist.md` before proposing or writing slices.
Classify each proposed slice as `AFK` or `HITL` using the checklist.
Default to `AFK` unless a product, design, architecture, policy, or compliance decision is materially required.
Use AFK and HITL labels for planning and review only.
Do not include those labels in final Jira issue content unless the user asks for them.
Add only real dependencies, not decorative sequencing.

In `default` mode, present the proposed breakdown before creating files unless the user explicitly says the breakdown is already approved or asks you to assume approval.
For each slice, show:

- **Title**: short descriptive name
- **Type**: `HITL` or `AFK`
- **Blocked by**: required predecessor slices, if any
- **Requirements covered**: PRD requirement IDs and source goals addressed

Ask whether the granularity, dependencies, and HITL or AFK labels look right.
Do not create files in default mode until the user approves the breakdown or has already told you to assume approval.

In `brief` mode, skip the full review loop unless multiple plausible breakdowns would materially change the Jira files.
If that happens, ask the smallest useful question and then continue.

## Jira file creation

Create one markdown file per approved slice in dependency order.
Use predictable filenames such as `01-short-slice-title.md`, `02-next-slice-title.md`, and so on.

Before drafting Jira files, read `references/ticket-writing-checklist.md`, `references/jira-issue-template.md`, and `references/example-ticket.md`.
Use the Jira template as the authoritative raw structure for every generated issue.
Preserve the raw HTML structure, panel classes, inline styles, section order, German labels, German Gherkin keywords, and notes-panel structure from the template.
Acceptance criteria must be named scenarios inside dashed panels, not a checklist.
Always include the notes panel.
Within the notes list, include only entries that carry real information.
Omit empty entries rather than writing placeholders such as `Keine`.

Shape each ticket around explicit delivery properties:

- The title and user story name the product outcome, not the implementation surface.
- The benefit explains why the behavior matters to the user, operator, business, compliance posture, or delivery risk.
- Acceptance scenarios define observable completion and important boundaries without enumerating the build sequence.
- Notes provide decision-relevant context, dependencies, assumptions, risks, and open questions, not a decomposition of engineering tasks.
- Technical hints appear only when they narrow an important source-backed constraint or expose context that senior engineers would not reasonably infer.

## Final quality gate

Before saving each file, check the complete issue against these rules:

- German labels and German sentence framing are used throughout, while established source-backed English terms remain English when clearer.
- The Hinweise section follows `references/jira-issue-template.md`: the `jePanel_idea` header is closed before a `<ul>` with one `<li>` per included note entry.
- Empty note entries and placeholder values such as `Keine` are omitted.
- Ticket content is self-contained and does not mention the PRD, brief, source document, source section, or unavailable planning artifact.
- Cross-ticket references appear only for real prerequisites or delivery dependencies.
- Scenario text uses first-person participant phrasing where natural, such as `ich sehe`, `ich erhalte`, `ich wähle`, `ich öffne`, or `ich befinde mich`.
- Scenario text avoids filler adjectives such as `nahtlos`, `robust`, `umfassend`, `zuverlässig`, `eindeutig`, and `sichergestellt`.
- Titles, scenarios, and notes describe outcomes, behavior, constraints, and acceptance boundaries instead of API, schema, table, service, component, method, file, test-suite, or layer-by-layer changes.
- Product rules, validations, quotas, permission nuances, recovery flows, and edge cases are source-backed, directly implied, or explicitly framed as assumptions or open questions.
- `Technische Hinweise` are brief, decision-relevant, and limited to non-obvious source-backed constraints.
- The final files are written in dependency order with predictable filenames.

## Final response

After writing the files, summarize the created filenames, intended slice order, material assumptions, and open questions.
