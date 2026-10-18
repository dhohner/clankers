---
name: to-issues
description: >-
  Converts PRDs, feature briefs, and Gherkin scenarios into local Jira ticket files in German or English.
  Use when requirements or an accepted to-prd bundle need Jira stories or backlog items.
argument-hint: "[default|brief] [de|en]"
---

# To Issues

Write independently demoable Jira stories for experienced developers in `action-items/jira-issues/`, unless the user chooses another location.
Write German by default; `en` or an explicit request selects English, regardless of the source language.

## Workflow

1. Resolve the source, mode, and language; build the source ledger.
2. Map the ledger to demoable slices and resolve the applicable approval gate.
3. Read the drafting references and write one ticket per approved slice.
4. Validate against the source and format; fix violations and repeat before completion.

Read references only for the current step and selected language.

## Intake and slicing

Recognize `default` and `brief` as mode arguments, and `de` and `en` as language arguments.
Otherwise infer `default` for a full PRD or accepted `to-prd` bundle and `brief` for unpackaged requirements.

Use the reference for the selected source:

- [Default intake](references/default-source-intake.md) for a PRD or accepted bundle.
- [Brief intake](references/brief-mode-intake.md) for a feature brief, rough planning prose, or scenarios.

Maintain a source ledger covering behavior, constraints, exclusions, dependencies, uncertainty, success measures, and traceability.
Keep the requested input as the requirements source; templates, examples, evaluation fixtures, and previous output supply no additional product requirements.
Treat supplied Gherkin scenarios as the functional source of truth.
Consult repository context when it resolves terminology or constraints grounded in the source.

Use [slice design](references/slice-design-checklist.md) to define outcomes, dependencies, planning classifications, and any required approval.
Proceed once the requirements support stable slices and the applicable approval is resolved.

## Drafting

Read these references before drafting the approved slices:

- [Ticket content](references/ticket-writing-checklist.md): outcomes, acceptance cases, inherited behavior, success measures, and notes.
- [Ticket prose](references/ticket-prose.md): wording and preservation of source meaning.
- [Jira structure](references/jira-issue-template.md): panels, styles, and section order.
- For German: [language](references/language-de.md) and [raw template](references/jira-template-de.md).
- For English: [language](references/language-en.md) and [raw template](references/jira-template-en.md).

Consult the selected language's example only when phrasing or ticket shape remains uncertain: [German](references/example-ticket-de.md) or [English](references/example-ticket-en.md).
Create one file per approved slice in dependency order, using names such as `01-short-slice-title.md`.

## Validate and complete

Compare each draft with the source ledger: every behavior and boundary must be covered by acceptance, relevant notes, another mapped ticket, or an explicit exclusion.
Check in both directions for omitted requirements and claims absent from the source.
Check each ticket against the content checklist, prose rules, Jira structure, raw template, and selected language gate.
Fix violations and repeat these checks until none remain, then save the complete ticket set.
Report filenames, delivery order, material assumptions, and open questions.
If a decision blocks progress, ask for that decision.
