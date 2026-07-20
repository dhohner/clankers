# <Task title>

## Outcome

<Describe one observable completed behavior and why it matters.>

## Scope

### Required behavior

- <State a source-backed behavior, rule, or boundary.>

### Non-goals

<Include only exclusions that clarify the task boundary; remove this optional section when none apply.>

### Constraints and dependencies

<State source-backed constraints, risks, blockers, and prerequisite capabilities, describing what a predecessor must provide rather than referring only to its task number; remove this optional section when none apply.>

### Contract details

<Insert the concrete durable-record, state-transition, retry, atomicity, and authorization clauses established for this slice, including unresolved material decisions as blockers; remove this optional section when the contract branch does not apply.>

## Repository context

<Record only inspected, decision-relevant integration points, conventions, data contracts, and validation commands; label non-binding implementation ideas explicitly.>

## Acceptance criteria

```gherkin
Scenario: <Observable outcome>
  Given <relevant starting state>
  When <actor or system action>
  Then <observable result>
```

<Add only the scenarios needed to establish completion and important boundaries.>

## Validation

- <Provide a concrete command, targeted test, or focused observable check, including expected evidence.>

## Execution and handoff

Deliver the outcome and run the validation above plus any directly relevant repository checks.
Report:

- changed files;
- exact validation commands and observed results; and
- unresolved blockers or assumptions.
