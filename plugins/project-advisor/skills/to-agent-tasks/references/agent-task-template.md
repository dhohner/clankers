---
depends_on:
  - <NN-predecessor-task-title.md>
state: pending
---

<Start the file with this block on line 1, holding only these two keys.
List under `depends_on` the file name of each direct predecessor, such as `01-short-task-title.md`.
A direct predecessor is a task whose capability this task needs and that no other listed predecessor already requires, directly or through its own predecessors.
Give each listed file exactly one `Needs first` line that starts with its file name, and list only these tasks.
Name only task files in the destination directory with a lower numeric prefix, whether written in this run or kept from an earlier one.
Write `depends_on: []` for a task without a `Needs first` line.
Write `state: pending`, because only the tool that implements the task sets `state: done`.>

# <Task title>

## Outcome

<State one observable result and its value in one short paragraph.>

## Required behavior

- <List exact source behavior, rules, boundaries, edge cases, and useful requirement IDs.>

## Contract

<Keep this section only for a slice with contract risks or a contract that other tasks share.
State each applicable data, state, replay, concurrency, atomicity, failure, and authorization decision once.
Write only decisions that the PRD or inspected repository evidence supports.
Put unresolved decisions under Blockers.
Write a contract that other tasks also state as a shared block, and copy the block unchanged into every task that states it:>

### Shared: <Contract name>

<State the shared contract, such as a file format, a response shape, or a command, in the same words in every task.>

## Boundary

- May change: <Name owned artifacts, configuration, and behavior.>
- Must preserve: <Name specific properties that callers or users require.>
- Out of scope: <Name likely but excluded work.>
- Executor choices: <Name routine, reversible choices that the source and repository leave open, when the executor might otherwise treat them as fixed.>
- Assumptions: <Name facts the task relies on but nobody could verify, and minor task decisions without source evidence.>
- Blockers: <Name the unresolved decision, required evidence, and affected behavior.>
- Needs first: `<NN-predecessor-task-title.md>` <State the prerequisite capability contract and why this task needs it.>

<Keep only applicable Boundary lines.
An Executor choices or Assumptions line never holds a decision that changes required behavior, a public or persisted contract, security, external state, or scope; put an unsettled one under Blockers.
Keep the four sentences below unchanged in every task.>

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

- <Name the exact command or manual check, its expected evidence, and its coverage type: new-behavior coverage, regression coverage, or manual verification.
Use a command that exists now, or one that this task or a named predecessor creates.>
- <Name the tool a check needs when it is not installed, and the manual check that replaces it until it is.>
