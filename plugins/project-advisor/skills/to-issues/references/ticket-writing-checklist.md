# Ticket Writing Checklist

Write a concise product specification for a senior engineer, not a build sequence.

This file is the content standard for both ticket languages.
Read it alongside the reference for the selected ticket language, [`language-de.md`](language-de.md) or [`language-en.md`](language-en.md), which owns register, wording, and the fixed labels.
Spell every label and Gherkin keyword the way [`jira-issue-template.md`](jira-issue-template.md) spells it for that language.
This file names each note entry by its role, such as the *what to build* entry.
The template gives the label to write.

## Outcome focus

Make the title and user story name the product outcome.
State why the behavior matters to a user, operator, business outcome, compliance posture, or delivery risk.
Describe observable behavior, data outcomes, constraints, and acceptance boundaries.
Express source references to APIs, tables, services, engines, components, methods, files, and test suites as domain behavior unless the term itself is user-facing or a binding source constraint.
Keep each ticket understandable without access to the PRD, brief, source file, or unavailable source section.
Planning vocabulary such as `Slice`, `Tracer Bullet`, `AFK`, and `HITL` belongs to the breakdown conversation.
In the ticket, name a predecessor by its title and describe the outcome the ticket delivers.

## Source fidelity

Use only behavior and rules that are explicit or directly implied by the source ledger.
Place material uncertainty in the *assumptions* or *open questions* entry when it can remain unresolved without destabilizing the slice.
Preserve source-backed validations, quotas, permissions, recovery behavior, integration constraints, and non-goals in the slices they govern.
Use bounded repository evidence only to clarify terminology, product surfaces, system boundaries, or constraints already grounded in the source.

## Acceptance scenarios

Write named Gherkin scenarios using the keywords of the ticket language and only useful `And` lines.
Anchor user-facing scenario steps to the participant with natural first-person phrasing.
For system-verifiable behavior, name the external observer or system boundary that can verify the result.
Name concrete screens, actions, system responses, data outcomes, and important boundaries.
Three lines are sufficient for a straightforward scenario; add lines only for distinct testable information.
Use observable facts in place of the filler the language reference lists.
Express internal identifiers such as class names, method signatures, enum constants, and database artifacts in domain language or externally observable behavior.

## Notes

Always include the *what to build* entry as a compact, self-contained description of the vertical outcome and its important boundaries.
Include the *blocked by* entry only for a genuine predecessor slice.
Use the *technical notes* entry only for non-obvious source-backed constraints or context that materially helps an experienced developer.
A rule an acceptance scenario already states earns nothing as a note, and where to enforce it is an engineering decision rather than a product constraint.
Use the *assumptions*, *dependencies*, *risks*, and *open questions* entries only when they carry decision-relevant information.
Omit empty note entries instead of adding placeholders such as `Keine` or `None`.
Keep implementation choices with engineering unless the source establishes a product, compliance, architecture, or integration constraint.

## Rewrite test

Rewrite any title, scenario, or note that reads like a layer-by-layer task list.
Rewrite any that states a rule an acceptance scenario already proves, or that names an internal identifier where observable behavior belongs.
The language reference carries worked pairs, and its example ticket carries a fuller comparison.

## Final gate

Check every complete ticket against every line below and fix each failure:

- The file follows every structural rule in `jira-issue-template.md`, including panel order, classes, styles, one dashed panel per named scenario, and a notes list outside the closed notes panel.
- The ticket passes every item in the language gate of the selected language reference.
- The title, capability, and benefit express an outcome rather than an implementation surface.
- The scenarios collectively prove the slice's happy path and every important source-backed boundary assigned to it.
- Scenario steps use participant-centered phrasing where natural, concrete outcomes, and no filler language or internal code identifiers.
- Every product rule is source-backed, directly implied, or explicitly framed as an assumption or open question.
- The ticket is self-contained and contains no reference to an unavailable PRD, brief, planning artifact, or source section.
- Cross-ticket references identify only genuine prerequisites or delivery dependencies.
- The *what to build* entry is present; every other note entry earns its place and contains real information.
- The *technical notes* entry is brief, non-obvious, decision-relevant, free of standard stack or routine implementation guidance, and does not restate a rule an acceptance scenario already proves.
- The ticket contains no layer-by-layer implementation plan or autonomous-agent instructions.
- The ticket keeps planning vocabulary out of its text: a predecessor is named by its title rather than as `Slice 01`, `Tracer Bullet`, `AFK`, or `HITL`.
- The filename is predictable and its sequence number respects real dependencies.

**Complete when:** every ticket has been evaluated against every gate item in this file and in the selected language reference, and no known violation remains.
