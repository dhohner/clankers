# Ticket writing checklist

Write a concise product specification for an experienced engineer.
The selected language reference defines register and terminology; the Jira template defines structure and fixed labels.

## Outcomes and source fidelity

Use the title to name the outcome, the user story to explain the benefit, and the *what to build* entry to summarize scope and important limits.
Keep these concise without repeating detailed acceptance criteria.
Describe observable behavior, data outcomes, constraints, and acceptance boundaries.
Express internal implementation terms as domain behavior unless they are names users see or binding source constraints.
Leave implementation choices with engineering.

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
Record usability goals and other success measures as validation context in *technical notes*, identifying their purpose and preserving the source's participant, method, target, and timing where stated.
Preserve explicit release or acceptance conditions and their validation methods as binding requirements.

## Acceptance scenarios

Write named Gherkin scenarios in the selected language.
Use natural first-person phrasing when a person acts; for system behavior, name the observer or boundary that verifies it.
State concrete actions, responses, data outcomes, and boundaries using only steps that add testable information.

Group cases by product rule, state transition, or distinct failure outcome.
Variations in values, actors, entry points, or interface language can share a panel when each case's conditions and expected result remain explicit.
For example, one download authorization scenario can grant access to the creator and deny access to another user.
Split cases when grouping would make the behavior ambiguous.
Preserve boundary values, time origins, exact interface messages, permission paths, and failure results.
Let requirements determine scenario count.
Keep the template's panels and colored steps; use compact Gherkin cases within them without introducing tables or scenario outlines.

## Notes

Always include *what to build* as a compact description of the outcome and important boundaries.
Include *blocked by* only for a genuine prerequisite.
Use *technical notes* for source constraints, success measures, or context that changes an engineering decision.
Avoid routine implementation guidance and restatements of acceptance scenarios.
Include *assumptions*, *dependencies*, *risks*, and *open questions* only when they carry relevant information.
Omit empty entries.

## Completion criteria

- Every source ledger item is represented by acceptance, relevant notes, another mapped ticket, or an explicit exclusion.
- Scenarios cover each slice's happy path and assigned boundaries, with explicit conditions and results for grouped cases.
- Dependencies reflect real prerequisites and filenames follow their order.
- Each ticket is understandable independently and inherits only the necessary predecessor context.
- Success measures remain visible and explicit acceptance or release conditions retain their force.
