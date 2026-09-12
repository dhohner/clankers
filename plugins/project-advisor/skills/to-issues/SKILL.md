---
name: to-issues
description: >-
  Create Jira-ready tracer-bullet issues in German or English from product requirements and planning material.
  Use when the user wants a PRD or accepted to-prd bundle converted into tickets, or a feature brief, rough planning prose, or Gherkin scenarios converted into engineer-facing backlog items.
  Writes German tickets unless the user asks for English ones.
  Produces copyable Markdown rather than creating live tracker items.
argument-hint: "[default|brief] [de|en]"
---

# To Issues

Convert settled product planning into independently demoable Jira stories for experienced human developers.
Write local Markdown files to `action-items/jira-issues/` unless the user chooses another location.
Compose tickets in the selected ticket language, in the register of a product team that speaks it.

## Process

### 1. Resolve the run and build the source ledger

Treat an argument as the mode only when it is `default` or `brief`.
Treat an argument as the ticket language only when it is `de` or `en`.
Otherwise use `default` for a full PRD or accepted `to-prd` bundle and `brief` for feature briefs, rough planning prose, feature descriptions, or other unpackaged requirements.

Write German tickets unless an `en` argument or an explicit request in the conversation selects English.
The PRD, brief, and repository language never select the ticket language.
Tickets are written for the team that reads them.

Load the intake reference for the selected mode before extracting requirements:

- In `default` mode, read [`references/default-source-intake.md`](references/default-source-intake.md).
- In `brief` mode, read [`references/brief-mode-intake.md`](references/brief-mode-intake.md) before asking questions.

If intake changes the mode, load the new mode's reference before continuing.

Build a source ledger of behavior, constraints, non-goals, dependencies, assumptions, risks, open questions, success measures, and traceability.
Treat Gherkin scenarios as the functional source of truth when present.
Inspect repository context only to resolve source-backed terminology, workflow names, roles, labels, system boundaries, or non-obvious constraints, and keep that inspection bounded to the ambiguity.

**Complete when:** the mode, ticket language, and source are resolved, and the ledger accounts for every source item that can affect ticket behavior, acceptance boundaries, slicing, or delivery order.

### 2. Design tracer bullets

Read [`references/slice-design-checklist.md`](references/slice-design-checklist.md), then map the source ledger into thin vertical slices.
Each slice must produce one user-visible or system-verifiable outcome across the system boundaries needed to demonstrate it.
Classify slices as `AFK` or `HITL` for planning, and add only prerequisite dependencies.
Follow the checklist's mode-specific approval gate.

**Complete when:** every deliverable requirement maps to at least one slice, every slice is independently demoable or names a real predecessor, all material uncertainty is surfaced, and any required breakdown approval has been received.

### 3. Draft every approved issue

Before drafting, read:

- [`references/ticket-writing-checklist.md`](references/ticket-writing-checklist.md)
- the reference for the selected ticket language, [`references/language-de.md`](references/language-de.md) or [`references/language-en.md`](references/language-en.md)
- [`references/jira-issue-template.md`](references/jira-issue-template.md)

Phrasing, note density, or lean-ticket shape can stay uncertain after the checklist, the language reference, and the template.
Then consult the worked example for the selected language, [`references/example-ticket-de.md`](references/example-ticket-de.md) or [`references/example-ticket-en.md`](references/example-ticket-en.md).
Read only the references for the selected language, because the other language's wording and examples pull the drafts toward it.
Create one file per approved slice in dependency order with predictable names such as `01-short-slice-title.md`.
The template is the authoritative structure, the writing checklist the content standard, and the language reference the wording standard.

**Complete when:** every approved slice has a complete draft and every ledger item is represented in an acceptance scenario, a decision-relevant note, another mapped slice, or an explicit exclusion.

### 4. Validate, then save

Check each complete draft against:

- every structural rule in the Jira template
- every final-gate rule in the ticket-writing checklist
- every gate item in the selected language reference

Fix each violation before saving the files.

**Complete when:** every generated file has been checked against every applicable rule, all checks pass, and the files exist in dependency order at the chosen destination.

### 5. Report the result

Summarize the created filenames, intended slice order, material assumptions, and open questions.
If the process paused for clarification or approval, state the single pending decision instead of claiming files were created.

**Complete when:** the response accurately distinguishes created output from pending work.
