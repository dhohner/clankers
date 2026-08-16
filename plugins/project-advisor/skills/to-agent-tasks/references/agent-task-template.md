# <Task title>

## Outcome

<One short paragraph: the single observable behavior this task delivers and why it matters.>

## Required behavior

- <Each source-backed behavior, rule, exact value, threshold, and edge case needed for this outcome; keep requirement IDs when useful for traceability.>

## Contract

<Optional: include only when the contract-precision pass triggered for this slice.
State the applicable vocabulary, durable data, state transition, boundary, replay, concurrency, atomicity, failure, and authorization clauses, one compact clause per decision.
Name unresolved contract decisions in the Boundary section as blockers instead of settling them here.>

## Boundary

- May change: <the artifacts, configuration, and behavior this task owns.>
- Must survive: <the named properties something else depends on - field names, meanings, response shapes, status codes, ordering, existing values - that a reasonable executor might plausibly break; name what survives, not a blanket "behaves as today" that the task's own change contradicts.>
- Out of scope: <exclusions a reasonable executor might otherwise pull in.>
- Your call: <choices deliberately left to the executing agent, stated so no effort goes into inferring a preference that does not exist.>
- Assumptions: <decisions neither the PRD nor the repository settles that this task settles anyway to stay executable, labeled here so a reviewer can catch them.>
- Blockers: <the narrowest unresolved decision and the evidence needed to settle it; the task still delivers everything the blocker does not prevent.>
- Needs first: <prerequisite capabilities described by their guaranteed contract, with why this outcome needs each one.>

Record the choices you make where this task leaves them open.
Stop and report at any decision this task does not settle rather than widening scope or inventing one.

<Keep only the boundary lines that apply; the two closing sentences always stay.
State each fact once and let other sections refer to it.>

## Repository notes

<Inspected facts only: the entry points to start from, binding contracts and conventions, and non-obvious wiring that would cost the executor a wrong turn.
Pointers over tours: name the path and symbol, not everything that exists.
Label any non-binding implementation option as such.>

## Acceptance

- <Observable checks that prove the outcome, its exact boundaries, and its failure behavior, in behavioral technology-neutral language.>
- <Preserve the semantics of every source scenario assigned to this slice; where a check assumes a starting state, make it explicit and consistent with inspected fixture data, or have the check establish it.>

## Validation

- <Exact command, targeted test, or focused manual check, and the evidence it must show; distinguish new-behavior evidence from regression coverage.>
