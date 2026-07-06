---
name: to-issues
description: Convert accepted PRDs, to-prd prd.yaml bundles, specs, feature briefs, rough planning prose, or Gherkin scenarios into German Jira-ready markdown issues using tracer-bullet vertical slices. Use this skill whenever the user asks to turn planning material into Jira tickets, issues, work items, backlog items, action items, implementation slices, or engineer-facing delivery stories, including brief-mode requests from incomplete prose. Do not use it to write PRDs or create live tracker items. Output copyable behavior-focused markdown, not implementation checklists.
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

- `references/default-source-intake.md`: use only when default mode has no readable PRD, points at `index.html`, or is HTML-only.
- `references/brief-mode-intake.md`: use before asking questions in brief mode.
- `references/slice-design-checklist.md`: use before proposing or writing slices.
- `references/ticket-writing-checklist.md`, `references/jira-issue-template.md`, and `references/example-ticket.md`: use before drafting Jira files.

## Workflow

1. Select `default` or `brief` mode.
2. Resolve the source with the lightest viable intake path.
3. Extract source-backed behavior, constraints, dependencies, assumptions, risks, open questions, and traceability.
4. Create thin vertical slices with demoable outcomes and real dependencies.
5. In default mode, get breakdown approval unless approval is already given or explicitly assumed.
6. Create one Jira-ready markdown file per approved slice.
7. Summarize created files, intended slice order, material assumptions, and open questions.

## Mode and source rules

Interpret the first argument as the mode when present.
Valid values are `default` and `brief`.
If no argument is provided, choose from the source material.

Use `default` for a full PRD, especially a `to-prd` bundle with `prd.yaml`.
Use `brief` for explicit brief requests, feature briefs, rough planning prose, feature descriptions, or any source that is not a packaged PRD artifact.
Brief mode starts from the user's input, prior conversation, and referenced files.
Do not require, request, or synthesize a full PRD in brief mode.

### Default mode

If the user provides a readable PRD file, especially `prd.yaml`, read that file directly.
With an explicit `prd.yaml` and an approved or assumed-approved breakdown, use the short path: read the PRD, read the slice checklist, draft slices, load writing references, and write files.
Do not ask for the source, read a sibling `index.html`, load default source-resolution guidance, or perform broad repository exploration when an explicit `prd.yaml` is available.

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

## Product guardrails

- Treat Gherkin scenarios as the source of truth for functional behavior and acceptance criteria.
- Use only behavior, constraints, dependencies, assumptions, risks, and open questions that are explicit or directly implied by the source.
- Describe what the system should do and why it matters, not how engineering should build it.
- Make the product outcome, acceptance boundary, constraints, dependencies, risks, and open questions explicit enough that senior engineers can make sound implementation decisions.
- Use precise, confident, collaborative language rather than instructional, managerial, or stakeholder-facing prose.
- Trust the engineering audience to choose the implementation approach unless the source contains a real product, compliance, architecture, or integration constraint.
- Make every ticket self-contained for someone who has not read the PRD, brief, or planning artifact.
- Do not refer to the source PRD, brief, planning artifact, or unavailable source sections from ticket content.
- Keep codebase exploration bounded to product terminology, existing workflow names, system boundaries, role names, user-facing labels, and non-obvious constraints.
- Do not turn repository implementation details into required work unless the source supports them.

## Slice design and review

Create thin tracer-bullet slices with demoable outcomes.
Organize slices around user-visible or system-verifiable outcomes, not around engineering layers.
Use engineering boundaries only when they improve quality, simplicity, robustness, scalability, or long-term maintainability without turning the ticket into an implementation checklist.
Avoid tickets that only prepare an API, database, UI, migration, service, test suite, or architecture foundation.

Classify each slice as `AFK` or `HITL` using the checklist.
Default to `AFK` unless a product, design, architecture, policy, or compliance decision is materially required.
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

Every issue must preserve the raw HTML structure, panel classes, inline styles, section order, German labels, German Gherkin keywords, and notes-panel structure from the template.
Acceptance criteria must be named scenarios inside dashed panels, not a checklist.
Each scenario should describe externally verifiable behavior, outcomes, and constraints.
Prefer first-person participant phrasing such as `ich sehe`, `ich erhalte`, `ich wähle`, `ich öffne`, or `ich befinde mich` when it expresses the behavior naturally.

Shape the story around explicit delivery properties:

- The title and user story name the product outcome, not the implementation surface.
- The benefit explains why the behavior matters to the user, operator, business, compliance posture, or delivery risk.
- Acceptance scenarios define observable completion and important boundaries without enumerating the build sequence.
- Notes provide decision-relevant context, dependencies, assumptions, risks, and open questions, not a decomposition of engineering tasks.
- Technical hints are appropriate only when they narrow an important constraint or expose context that senior engineers would not reasonably infer.
- The overall tone is direct, specific, and collegial, with no status-report framing, prioritization theater, or generic stakeholder language.

Always include the notes panel.
Within the notes list, include only entries that carry real information.
Omit empty entries rather than writing placeholders such as `Keine`.
`Was umgesetzt werden soll` should always be compact, self-contained, and outcome-oriented.
Only model cross-ticket references when they are needed for delivery, for example in `Blockiert durch` or `Abhängigkeiten`.
Keep `Technische Hinweise` brief, decision-relevant, and limited to non-obvious source-backed constraints.

Before saving each file, remove:

- implementation plans, layer-by-layer build steps, and internal code artifacts
- technical solutions that the source does not explicitly require
- architecture nouns copied from the source when user-visible or domain language would say the same thing
- invented product rules, validations, quotas, permission nuances, recovery flows, or edge cases
- references to source documents or unavailable source sections
- empty note sections and placeholder values
- generic adjectives or filler that do not change the meaning

## Final response

After writing the files, summarize the created filenames, intended slice order, material assumptions, and open questions.
