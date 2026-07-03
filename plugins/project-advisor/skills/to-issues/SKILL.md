---
name: to-issues
description: Convert accepted PRDs, to-prd prd.yaml bundles, feature briefs, or planning prose into German Jira-ready markdown work items using tracer-bullet vertical slices. Use this skill whenever the user asks to turn a PRD, spec, feature brief, rough idea, or accepted planning artifact into Jira tickets, issues, work items, action items, implementation slices, or engineer-facing backlog items, including fast-mode requests that start from incomplete prose. Do not use it to write a new PRD or to create live Jira or GitHub issues. The output is copyable markdown files focused on behavior, outcomes, constraints, dependencies, and developer-relevant context, not layer-by-layer implementation tasks.
argument-hint: "[default|fast]"
---

# PRD to Issues

Use this skill to turn settled product planning into independently implementable Jira-ready markdown work items.
The work items should read like concise specifications from one strong teammate to another.
They should describe desired behavior, observable outcomes, constraints, assumptions, dependencies, risks, and open questions.
They should not read like step-by-step instructions for an autonomous coding agent.

Do not create or modify Jira issues, GitHub issues, or any external tracker items.
The output of this skill is a set of markdown files that the user can copy into Jira.

## Mode selection

Interpret the first argument as the mode when it is present.
Valid values are `default` and `fast`.
If no argument is provided, choose the mode from the source material.

Use `default` when the user provides or points to a full PRD, especially a `to-prd` bundle with `prd.yaml`.
In `default` mode, locate or request the PRD, decompose it into vertical slices, review the breakdown with the user, then create Jira-ready files.

Use `fast` when the user explicitly says `fast`, provides a feature brief, rough planning prose, a feature description, or any source that is not a packaged PRD artifact.
In `fast` mode, start from the user's input, prior conversation, and referenced files.
Do not require, request, or synthesize a full PRD.

## Gather source context

### Default mode

Ask the user for the PRD source if it is not already in context.
Prefer a PRD file that already exists in the workspace.
When a `to-prd` bundle contains both `prd.yaml` and `index.html`, use `prd.yaml` as the planning source of truth and treat `index.html` as a reviewer-facing companion.
When the user points at `index.html`, first look for a sibling `prd.yaml`.

When the source is `prd.yaml`, preserve the structured planning data, including constraints, non-goals, open questions, success measures, and traceability that may be flatter in the rendered review surface.
Use `index.html` only to recover reviewer-facing phrasing or confirm how the accepted bundle presents the material.

When only HTML is available, extract the semantic planning content and ignore presentational markup, inline CSS, metadata pills, comments, and browser-review chrome.
Use a structured parser when one is readily available.
Otherwise, read the HTML carefully enough to preserve section intent without copying template scaffolding into tickets.

If the user only has planning prose or a feature brief instead of a `to-prd` artifact, switch to `fast` mode.

### Fast mode

Before the first serious question round in `fast` mode, read [references/fast-mode-intake.md](./references/fast-mode-intake.md).

Extract settled facts before asking anything new.
Carry forward the actor, desired behavior, rollout constraints, dependencies, non-goals, and source-backed product rules already present in the conversation or referenced files.

Ask only for missing information that materially changes scope, behavior, dependencies, acceptance criteria, ownership, rollout risk, or the slice breakdown.
Batch related questions into one round.
Use the interactive `ask_question` tool when available, offer predefined options when useful, and fall back to concise chat questions only if no interactive question tool exists.

Treat these as decomposition-changing ambiguities unless the source settles them:

- personal versus shared ownership
- which actors receive the first usable version
- whether the feature extends an existing workflow or adds a new management surface
- whether behavior is manual, automatic, or mixed
- whether unresolved invalid-state handling needs its own slice
- whether rollout, compliance, or permission choices change which slices exist

If a plausible answer would change the slices, ask before drafting.
If clarification is impossible and the ticket set cannot stay stable without that answer, stop after surfacing the smallest blocking question.
If a ticket can remain stable, record the uncertainty as an assumption or open question instead of silently choosing a favorite interpretation.

Do not invent product rules, validation behavior, naming rules, deduplication behavior, permission nuances, quotas, recovery flows, or edge cases just to make the tickets feel complete.

## Explore the codebase

Inspect the repository before drafting slices unless the workspace is empty or clearly unrelated.
Use the codebase to verify product terms, existing workflows, system boundaries, role names, user-facing labels, and non-obvious constraints.
Do not turn implementation details found in the repo into required work unless the source context supports them.

## Design vertical slices

Before proposing or writing the slice breakdown, read [references/slice-design-checklist.md](./references/slice-design-checklist.md).

Create thin tracer-bullet slices.
Each slice should cut through the relevant system boundaries end-to-end and produce a demoable or externally verifiable outcome.
Prefer product outcomes over engineering layers.
Avoid tickets that only prepare an API, database, UI, migration, service, test suite, or architecture foundation without a user-visible or reviewer-visible outcome.

Classify each slice as `AFK` or `HITL`.
Use `HITL` only when human interaction is materially required, such as a product decision, design review, architectural choice, policy review, or compliance sign-off.
Default to `AFK` when the slice can be implemented and merged without a human decision beyond normal code review.

Add dependencies only when one slice cannot be meaningfully implemented or verified without another.
Avoid decorative dependency chains created only by preferred implementation order.
If two slices can land independently behind partial exposure or a flag, keep them independent.

## Review the breakdown

In `default` mode, present the proposed breakdown before creating files unless the user explicitly says the breakdown is already approved or asks you to assume approval.
For each slice, show:

- **Title**: short descriptive name
- **Type**: `HITL` or `AFK`
- **Blocked by**: required predecessor slices, if any
- **User stories covered**: the PRD user stories or source goals addressed

Ask whether the granularity, dependencies, and HITL or AFK labels look right.
Iterate until the user approves the breakdown.

In `fast` mode, skip the full review loop unless the source leaves multiple plausible breakdowns and choosing the wrong one would materially change the Jira files.
If that happens, ask the smallest useful question and then continue.

## Create Jira-ready markdown files

Before drafting the first issue, read these references:

- In `fast` mode, [references/fast-mode-intake.md](./references/fast-mode-intake.md)
- [references/slice-design-checklist.md](./references/slice-design-checklist.md)
- [references/ticket-writing-checklist.md](./references/ticket-writing-checklist.md)
- [references/jira-issue-template.md](./references/jira-issue-template.md)
- [references/example-ticket.md](./references/example-ticket.md)

Unless the user requests another location, create files in `action-items/jira-issues/`.
Create one markdown file per approved slice.
Create files in dependency order so later files can reference earlier slice titles or filenames in `Blockiert durch`.
Use predictable filenames such as `01-short-slice-title.md`, `02-next-slice-title.md`, and so on.

Every issue must follow the exact raw HTML structure and template rules in [references/jira-issue-template.md](./references/jira-issue-template.md) unless the user explicitly asks for a different format.
Use the Jira-compatible panels, inline styles, German labels, and German Gherkin keywords from the template.
Always include the notes panel.
In the notes list, include only entries that carry real information.
Omit empty entries rather than writing placeholders such as `Keine`.

If the PRD does not already provide the user story in `Als ... moechte ich ... damit ...` form, derive it from the slice intent.
Acceptance criteria must be named scenarios inside dashed panels, not a plain checklist.
Each scenario must describe externally verifiable behavior, outcomes, and constraints.
Write scenario lines from a participant's point of view, such as `ich sehe`, `ich erhalte`, `ich wähle`, `ich öffne`, or `ich befinde mich`.
Avoid generic third-person phrasing such as `der Nutzer`, `der Genehmiger`, `die Anfrage`, or `es wird`, when first-person phrasing can express the same behavior.

## Ticket writing rules

Write for experienced human developers.
Describe the intended behavior and relevant constraints, then let the developer decide the implementation details.

If the source contains suggested solution details such as APIs, tables, schemas, services, UI components, jobs, view names, workflow engines, notification services, assignment APIs, React screens, or similar implementation ideas, treat them as context rather than instructions to copy into the work item.
Convert them into user-visible behavior or domain constraints before writing titles, user stories, scenarios, or `Was umgesetzt werden soll`.
Keep raw architecture terms only under `Technische Hinweise`, and only when omitting them would hide a real non-obvious integration constraint.

Scenarios must not reference internal code artifacts such as class names, service names, method signatures, enum constants, configuration keys, database tables, or database columns.
When the source names such identifiers, convert them into domain language or observable system behavior.

Especially in `fast` mode, prefer fidelity to the source over false completeness.
Do not add acceptance criteria for unsupported naming rules, deduplication behavior, permission exceptions, quotas, recovery flows, or other product details.
Ask, omit, or record them as assumptions or open questions depending on whether they change the slice set.

Keep `Technische Hinweise` brief and decision-relevant.
Include only non-obvious implementation context, integration constraints, or source-backed technical facts that a senior developer would not already infer from the scenarios.
Do not include tech stack, standard authentication rules, routine CRUD implications, or generic implementation advice.

Use the rewrite test from [references/ticket-writing-checklist.md](./references/ticket-writing-checklist.md) before finalizing each slice.
Remove layer-by-layer build language, filler adjectives, invented product rules, empty note sections, and internal code identifiers.

## Language and terminology

Generated ticket content uses German as the base language.
This applies to titles, user stories, scenario names, scenario body text, note labels, and note content.

Do not force verbatim German translations when an English term is clearer, more precise, or established in the product, codebase, or team vocabulary.
Keep proper nouns, visible UI labels, code identifiers, acronyms, and common technical or product terms in English when translating them would reduce meaning.
Examples that may stay English when source or repo context supports them include `API`, `Feature Flag`, `Dashboard`, `Template`, `Workflow`, `Audit Log`, `Bulk Import`, `In-Product`, `Owner`, `Reviewer`, `Business Unit`, `Detail View`, `Design`, and `List View`.

Prefer natural German where it is clearer and not contradicted by source terminology.
For example, use `Fehlermeldung`, `Berechtigung`, `zuständige Person`, or `prüfende Person` when those are the product's natural words.
Avoid awkward German compounds created only to translate an English term.

The template labels and Gherkin keywords remain German: `Was umgesetzt werden soll`, `Blockiert durch`, `Technische Hinweise`, `Annahmen`, `Abhängigkeiten`, `Risiken`, `Offene Fragen`, `Angenommen`, `Wenn`, `Dann`, and `Und`.

## Final response

After writing the files, summarize the created filenames, the intended slice order, and any material assumptions or open questions.
Make clear that the files are Jira-ready markdown, not live Jira tickets.
