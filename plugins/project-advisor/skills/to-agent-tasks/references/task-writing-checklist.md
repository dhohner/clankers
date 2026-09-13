# Agent task quality gate

Check every drafted task against each item, and fix every failure before saving the task.

## Outcome and coverage

- Follow [agent-task-template.md](agent-task-template.md), keep required sections, remove unused optional content, and replace every placeholder.
- Define one observable result and its value in the title and Outcome.
- Map every assigned source item to required behavior, acceptance, validation, another slice, or a scoped blocker.
- Preserve every source requirement and scenario across the complete task set.

## Evidence and autonomy

- Support each binding claim with the PRD or inspected repository evidence.
- Label unsupported claims as assumptions or blockers.
- Include every product and contract decision needed for execution.
- Make each task independent of the PRD and sibling tasks.
- Limit repository notes to verified entry points, binding contracts, and hidden wiring that affects decisions.
- State prerequisite capabilities and their required contracts inline.
- Keep shared contracts consistent across tasks.
- Keep `Must preserve` free of any contract the same task changes.
- Leave routine, reversible implementation choices to the executor.
- Name each blocker's missing decision or evidence and affected behavior.
- Copy the template's executor boundary text into every task unchanged.

## Acceptance and validation

- State each check's action, result, boundaries, and relevant failure behavior.
- Match each check's starting state to an inspected fixture, or have the check establish it.
- Cover permissions, recovery, replay, and concurrency when applicable.
- Name an existing local command or focused manual check and its expected evidence.
- Classify validation as new behavior coverage or regression coverage.
- Keep validation free of remote effects.

## Focus

- Preserve exact identifiers, values, units, commands, and scenario details.
- State each binding fact once in prose.
- Repeat it in Acceptance only as observable evidence.
- Remove generic engineering advice, repository tours, and unsupported implementation steps.
- Keep only sentences that add product meaning, a contract, a boundary, evidence, or a completion check.

## Contract checks

For a slice with contract risks, check the task against [contract-precision.md](contract-precision.md).
