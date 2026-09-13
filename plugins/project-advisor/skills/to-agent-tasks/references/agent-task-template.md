# <Task title>

## Outcome

<State one observable result and its value in one short paragraph.>

## Required behavior

- <List exact source behavior, rules, boundaries, edge cases, and useful requirement IDs.>

## Contract

<Keep this section only for a slice with contract risks.
State each applicable data, state, replay, concurrency, atomicity, failure, and authorization decision once.
Put unresolved decisions under Blockers.>

## Boundary

- May change: <Name owned artifacts, configuration, and behavior.>
- Must preserve: <Name specific properties that callers or users require.>
- Out of scope: <Name likely but excluded work.>
- Executor choices: <Name material choices left open by the source and repository.>
- Assumptions: <Name task decisions unsupported by source evidence.>
- Blockers: <Name the unresolved decision, required evidence, and affected behavior.>
- Needs first: <State the prerequisite capability contract and why this task needs it.>

<Keep only applicable Boundary lines.
Keep the four sentences below in every task.>

Use repository evidence for routine, reversible implementation choices.
Complete the task and its safe local validation.
Record material choices.
Stop only when an unresolved decision would change required behavior, a public or persisted contract, security, external state, or scope.

## Repository notes

<Include verified entry points, binding contracts, and hidden wiring that guides a decision or prevents a likely error.
Label implementation suggestions as nonbinding.>

## Acceptance

- <State technology neutral checks for the outcome, boundaries, and failure behavior.>
- <Preserve each assigned source scenario and state any required starting state.>

## Validation

- <Name the exact command or manual check, expected evidence, and coverage type.>
