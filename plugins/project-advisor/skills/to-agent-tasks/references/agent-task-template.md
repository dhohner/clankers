# <Task title>

## Outcome

<One sentence describing the observable completed behavior and why it matters.>

## Scope

### Required behavior

- <Source-backed behavior, rule, or boundary.>

### Non-goals

<Optional. Include only exclusions that clarify the boundary.>

### Constraints and dependencies

<Optional. State source-backed constraints, prerequisite capabilities, risks, or blockers. Describe what a predecessor must provide, not merely its task number.>

### Contract details

<Optional. Include when this task changes durable records, state transitions, retries, or authorization. Define controlled vocabulary semantics, entity and field contracts, optionality, units or precision, authoritative time, required lookup paths, boundary behavior, operation-specific retry guarantees, atomicity, and access scope. Include only applicable details supported by the PRD or repository; identify unresolved material decisions as blockers.>

## Repository context

<Decision-relevant findings from repository inspection: existing workflows, integration points, conventions, and validation commands. Clearly label any non-binding implementation idea.>

## Acceptance criteria

```gherkin
Scenario: <Observable outcome>
  Given <relevant starting state>
  When <actor or system action>
  Then <observable result>
```

<Add only scenarios needed to establish completion.>

## Validation

- <Concrete command, targeted test, or focused observable check. For durable state transitions, cover applicable threshold boundaries, missing-state replays, exact record counts, rollback or no-partial-write behavior, and authorization scope. Use direct persistence assertions when no read interface is in scope.>

## Execution and handoff

Implement the required behavior using established repository conventions.
Run the validation above and any directly relevant checks.
Report changed files, validation results, and unresolved blockers or assumptions.
