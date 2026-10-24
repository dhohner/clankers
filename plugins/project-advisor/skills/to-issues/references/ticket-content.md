# Ticket content and prose

Specify the intended outcome, binding constraints, and acceptance evidence concisely for an experienced engineer.
Apply the wording rules below to titles, openings, criteria, verification methods, evidence, scenarios, and notes.
The selected language reference defines terminology and language conventions; the Jira template defines structure and fixed labels.

## Wording

Use plain, neutral German or English customary for an engineering or product team.
Name the actor, action, and observable result with concrete nouns and plain verbs.
State relationships precisely: who owns a record, what triggers an action, or which service supplies a document.
Use active voice when the actor matters and is known.

Remove rhetorical openings, invented objections, empty contrasts, repeated conclusions, inflated claims, sales language, and commentary about writing the ticket.
Keep sentences that add behavior, boundaries, reasons, or necessary context.
Rewrite awkward passages from their meaning instead of substituting flagged words.
Judge phrases in the selected language and context, including German patterns such as `nicht nur …, sondern auch` or `von entscheidender Bedeutung`.
For example, write `Ich exportiere die gefilterten Bestellungen als CSV.` or `I export the filtered orders as CSV.`

Preserve facts, actors, quantities, units, thresholds, ordering, concurrency, permissions, recovery rules, and uncertainty when editing.
Keep meaningful negatives such as denials and exclusions, and preserve quoted interface text verbatim.
Keep assumptions distinct from requirements and leave missing decisions unresolved.

Let requirements determine sentence and list structure, including lists with three distinct requirements and repeated Gherkin openings.
Prefer periods, commas, colons, or parentheses to sentence dashes unless the user's writing sample calls for them.
Preserve punctuation in names, code, paths, URLs, and quoted interface text, and hyphens required by spelling.
Use sentence case with normal German noun capitalization and exact product name spelling.
Omit decorative formatting and chat wrappers, and save only the final ticket text.

## Outcomes and source fidelity

Use the title to name the outcome.
For product tickets, explain the benefit in the user story.
Summarize scope and important limits under *what to build*.
For infrastructure tickets, explain the capability and its consumer in the opening paragraph.
State covered systems and limits under *scope*.
Keep these concise without repeating detailed acceptance criteria.
Describe observable behavior, data outcomes, constraints, and acceptance boundaries.
Express internal implementation terms as domain behavior unless they name a relevant system interface or are binding source constraints.
Preserve required technologies, resource types, trust relationships, and architecture decisions explicitly.
Leave choices the source does not settle with engineering.

Each ticket must be understandable without the planning source.
Use only requirements explicit or directly implied by the source ledger.
Preserve validations, quotas, permissions, recovery behavior, integration constraints, and exclusions in the tickets they govern.
Use repository evidence to clarify terminology and constraints grounded in the source.
Record material assumptions, risks, and open questions in the appropriate notes.
Keep planning classifications such as `AFK`, `HITL`, and `Tracer Bullet` in the breakdown conversation.

## Shared behavior across tickets

Name a genuine predecessor by its ticket title and summarize the contract the dependent outcome inherits.
State applicable security, ownership, and quota boundaries within each ticket.
Focus acceptance on behavior the ticket adds or could invalidate, such as current permissions during a retry or preservation of earlier downloads.
Inherited behavior needs enough context to understand the dependent outcome; copying an unchanged acceptance suite adds no coverage.

## Success measures and acceptance

Distinguish functional acceptance, product success measures, and explicit release conditions in the source ledger.
Put observable functional outcomes in acceptance scenarios.
Record usability goals and other success measures as validation context in product *technical notes* or infrastructure *operations* notes.
Identify their purpose and preserve the source's participant, method, target, and timing where stated.
Preserve explicit release or acceptance conditions and their validation methods as binding requirements.

## Acceptance scenarios

Apply these scenario rules to both profiles.
Preserve all supplied Gherkin scenarios and their conditions and results.

Write named Gherkin scenarios in the selected language.
Use natural first-person phrasing when a person acts; for system behavior, name the observer or boundary that verifies it.
State concrete actions, responses, data outcomes, and boundaries using only steps that add testable information.

Group cases by product rule, state transition, or distinct failure outcome.
Variations in values, actors, entry points, or interface language can share a panel when each case's conditions and expected result remain explicit.
For example, one download authorization scenario can grant access to the creator and deny access to another user.
Split cases when grouping would make the behavior ambiguous.
Preserve boundary values, time origins, exact interface messages, permission paths, and failure results.
Let requirements determine scenario count.
Use the selected template's scenario panels and compact Gherkin cases without scenario outlines.

## Notes

Use the selected template's note structure and fixed labels.
For infrastructure tickets, apply the evidence and operations rules in the infrastructure reference.
For product tickets:

Always include *what to build* as a compact description of the outcome and important boundaries.
Include *blocked by* only for a genuine prerequisite.
Use *technical notes* for source constraints, success measures, or context that changes an engineering decision.
Avoid routine implementation guidance and restatements of acceptance scenarios.
Include *assumptions*, *dependencies*, *risks*, and *open questions* only when they carry relevant information.
Omit empty entries.

## Completion criteria

After editing, compare the ticket with the source ledger for added or lost claims and check the selected language and template's HTML, panels, labels, colors, tables, lists, and Gherkin keywords.

- Every source ledger item is represented by acceptance, relevant notes, another mapped ticket, or an explicit exclusion.
- Acceptance covers each slice's happy path and assigned boundaries with explicit conditions and results.
  - It includes verification evidence where the profile requires it.
- Dependencies reflect real prerequisites and filenames follow their order.
- Each ticket is understandable independently and inherits only the necessary predecessor context.
- Success measures remain visible and explicit acceptance or release conditions retain their force.
