---
name: to-issues
description: >-
  Create German Jira-ready tracer-bullet issues from product requirements and planning material.
  Use when the user wants a PRD or accepted to-prd bundle converted into tickets, or a feature brief, rough planning prose, or Gherkin scenarios converted into engineer-facing backlog items.
  Produces copyable Markdown rather than creating live tracker items.
argument-hint: "[default|brief]"
---

# To Issues

Convert settled product planning into independently demoable Jira stories for experienced human developers.
Write local Markdown files to `action-items/jira-issues/` unless the user chooses another location.
Tickets are composed in German in the register of a German-speaking product team, per the ticket-writing checklist.

## Process

### 1. Build the source ledger

Treat the first argument as the mode only when it is `default` or `brief`.
Otherwise use `default` for a full PRD or accepted `to-prd` bundle and `brief` for feature briefs, rough planning prose, feature descriptions, or other unpackaged requirements.

Load the intake reference for the selected mode before extracting requirements:

- In `default` mode, read [`references/default-source-intake.md`](references/default-source-intake.md).
- In `brief` mode, read [`references/brief-mode-intake.md`](references/brief-mode-intake.md) before asking questions.

If intake changes the mode, load the new mode's reference before continuing.

Build a source ledger of behavior, constraints, non-goals, dependencies, assumptions, risks, open questions, success measures, and traceability.
Treat Gherkin scenarios as the functional source of truth when present.
Inspect repository context only to resolve source-backed terminology, workflow names, roles, labels, system boundaries, or non-obvious constraints, and keep that inspection bounded to the ambiguity.

**Complete when:** the mode and source are resolved, and the ledger accounts for every source item that can affect ticket behavior, acceptance boundaries, slicing, or delivery order.

### 2. Design tracer bullets

Read [`references/slice-design-checklist.md`](references/slice-design-checklist.md), then map the source ledger into thin vertical slices.
Each slice must produce one user-visible or system-verifiable outcome across the system boundaries needed to demonstrate it.
Classify slices as `AFK` or `HITL` for planning, and add only prerequisite dependencies.
Follow the checklist's mode-specific approval gate.

**Complete when:** every deliverable requirement maps to at least one slice, every slice is independently demoable or names a real predecessor, all material uncertainty is surfaced, and any required breakdown approval has been received.

### 3. Draft every approved issue

Before drafting, read:

- [`references/ticket-writing-checklist.md`](references/ticket-writing-checklist.md)
- [`references/jira-issue-template.md`](references/jira-issue-template.md)

Consult [`references/example-ticket.md`](references/example-ticket.md) only when phrasing, note density, or lean-ticket shape remains uncertain after reading the checklist and template.
Create one file per approved slice in dependency order with predictable names such as `01-short-slice-title.md`.
Use the template as the authoritative raw structure and the writing checklist as the authoritative content standard.

**Complete when:** every approved slice has a complete draft and every ledger item is represented in an acceptance scenario, a decision-relevant note, another mapped slice, or an explicit exclusion.

### 4. Validate, then save

Apply every structural rule in the Jira template and every final-gate rule in the ticket-writing checklist to each complete draft.
Fix each violation before saving the files.

**Complete when:** every generated file has been checked against every applicable rule, all checks pass, and the files exist in dependency order at the chosen destination.

### 5. Report the result

Summarize the created filenames, intended slice order, material assumptions, and open questions.
If the process paused for clarification or approval, state the single pending decision instead of claiming files were created.

**Complete when:** the response accurately distinguishes created output from pending work.
