---
name: to-issues
description: >-
  Creates local Jira tickets when converting PRDs, briefs, technical requirements, or Gherkin scenarios into backlog items.
argument-hint: "[default|brief] [de|en] [product|infrastructure]"
---

# To issues

Write independently verifiable tickets for experienced engineers in `action-items/jira-issues/`, unless the user chooses another location.
Create one file per slice in dependency order, using names such as `01-short-slice-title.md`.

## Select the workflow

Mode, language, and profile arguments are independent:

- `default`: full PRD or accepted `to-prd` bundle; follow [default intake](references/default-source-intake.md).
- `brief`: unpackaged requirements or scenarios; follow [brief intake](references/brief-mode-intake.md).
- `de` (default) or `en`: ticket language, regardless of source language.
- `product` or `infrastructure`: ticket profile, independent of Jira issue type.

Infer mode from the source when omitted.
An explicit language request also selects the ticket language.
Infer `infrastructure` for platform, DevOps, security, deployment, or operational capabilities; otherwise use `product` for application behavior.
An explicit profile applies to the requested set; for mixed sources, select and show each slice's profile in the breakdown.

## Define the slices

Build a source ledger covering behavior, constraints, exclusions, dependencies, uncertainty, success measures, and traceability.
Use the requested input as the requirements source; references and examples supply no additional requirements.
Treat supplied Gherkin scenarios as the functional source of truth.
Consult repository context when it resolves terminology or constraints grounded in the source.

Use [slice design](references/slice-design-checklist.md) for outcomes, dependencies, planning classifications, and approval gates.
For infrastructure work, also use [infrastructure tickets](references/infrastructure-tickets.md) for prerequisite contracts, decision boundaries, and acceptance evidence.
Once slices are stable and the applicable approval is resolved, write and validate the complete ticket set.
Ask only for decisions that block progress.

## Draft the tickets

Use the shared content and formatting references, then the language and template for each slice:

- [Ticket content](references/ticket-writing-checklist.md): source fidelity, acceptance, inherited behavior, and success measures.
- [Ticket prose](references/ticket-prose.md): wording.
- [Jira structure](references/jira-issue-template.md): shared formatting and profile differences.
- German: [language](references/language-de.md) and the [product template](references/jira-template-de.md) or [infrastructure template](references/jira-infrastructure-template-de.md).
- English: [language](references/language-en.md) and the [product template](references/jira-template-en.md) or [infrastructure template](references/jira-infrastructure-template-en.md).

Load only the languages and profiles used by the ticket set.
Consult examples only when phrasing or ticket shape remains uncertain:

- Uncertain product phrasing or shape: [German example](references/example-ticket-de.md) or [English example](references/example-ticket-en.md).
- Uncertain infrastructure phrasing or shape: [German example](references/example-infrastructure-de.md) or [English example](references/example-infrastructure-en.md).

## Complete

Compare drafts with the source ledger in both directions for omissions and unsupported claims.
Every behavior and boundary must appear in acceptance, relevant notes, another mapped ticket, or an explicit exclusion.
Correct source, content, language, and formatting violations before completing the set.
Report filenames, delivery order, material assumptions, and open questions.
