# <Task title>

## Outcome

<One short paragraph that states the single observable result and its value.>

## Required behavior

- <Source-backed behavior, exact rules, boundaries, and edge cases, with requirement IDs when useful.>

## Contract

<Include only for a contract-sensitive slice.
State each applicable data, state, replay, concurrency, atomicity, failure, and authorization decision once.
Put unresolved decisions under Blockers.>

## Boundary

- May change: <owned artifacts, configuration, and behavior.>
- Must survive: <the specific existing properties that callers or users depend on.>
- Out of scope: <likely but excluded work.>
- Your call: <choices delegated to the executor.>
- Assumptions: <task decisions unsupported by source evidence.>
- Blockers: <unresolved decision, required evidence, and the exact behavior it prevents.>
- Needs first: <prerequisite capability contract and why this task needs it.>

Record your delegated choices.
Stop and report at any decision this task does not settle rather than widen scope or invent an answer.

<Keep only applicable Boundary lines, but always keep the two instructions above.>

## Repository notes

<Include only inspected entry points, binding contracts, and non-obvious wiring that guide a decision or prevent a likely error.
Label implementation suggestions as non-binding.>

## Acceptance

- <Technology-neutral checks for the outcome, boundaries, and failure behavior.>
- <Preserve each assigned source scenario and state any required starting state.>

## Validation

- <Exact command or focused manual check, expected evidence, and whether it proves new or regression behavior.>
