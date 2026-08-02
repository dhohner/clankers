# <Task title>

## Outcome

<Describe one observable completed behavior and why it matters.>

## Scope

### Required behavior

- <State each source-backed behavior, rule, and boundary needed for this outcome; retain requirement IDs when useful for traceability.>

### Non-goals

<Include only exclusions that clarify this task boundary; remove this optional section when none apply.>

### Boundary and open choices

<Name what this task may create or modify, and the invariants a reasonable executor might plausibly break on the way, rather than an inventory of everything that exists.
State the choices this task deliberately leaves to the executing agent, so no effort goes into inferring a preference that does not exist.
Where this task changes something it also needs preserved, name the properties that survive rather than calling the behavior unchanged, so the invariant does not contradict the change on its face.
Say each fact once: this section carries the boundary, not a second copy of the behavior, contract, or repository sections.
Remove this optional section when neither applies.>

### Constraints and dependencies

<State source-backed constraints and risks, clearly labeled assumptions and blockers, and prerequisite capabilities.
Describe what each predecessor must provide and why this outcome needs it; remove this optional section when none apply.>

### Contract details

<State the applicable vocabulary, durable data, state transition, boundary, replay, concurrency, atomicity, failure, and authorization clauses.
Name unresolved material decisions as blockers; remove this optional section when the contract branch does not apply.>

## Repository context

<Record only inspected, decision-relevant paths, integration points, conventions, existing contracts, and safe validation commands.
Label any non-binding implementation option as such.>

## Acceptance criteria

```gherkin
Scenario: <Observable outcome>
  Given <relevant starting state>
  When <actor or system action>
  Then <observable result>
```

<Add the source-backed scenarios needed to prove completion and material success, boundary, and failure behavior.>

## Validation

- <Name an exact command, targeted test, or focused observable check and the expected evidence.>
- <Include directly relevant regression coverage, or remove this item when none applies.>

## Execution and handoff

Deliver the outcome above and run the listed validation plus directly relevant repository checks.
Stay inside the boundary this task sets: make the choices it leaves open to you and record them, and when something it does not settle blocks safe progress, stop and report rather than widening scope or inventing a decision.
Report:

- changed files;
- exact validation commands and observed results;
- manual checks performed and their observations;
- choices made where this task left the decision open; and
- unresolved blockers or assumptions.
