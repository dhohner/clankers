# Agent task quality gate

Read each task file against every item, and fix every failure before you report the task set.
The validator already checks file names, frontmatter, sections, placeholders, the executor text, coverage types, shared block copies, and the source map format.

## Outcome and coverage

- Define one observable result and its value in the title and Outcome.
- Map every assigned source item to required behavior, acceptance, validation, another slice, or a scoped blocker.
- Preserve every source requirement and scenario across the complete task set.
- Make each source map row agree with the task text it names.

## Evidence and autonomy

- Support each binding claim with the PRD or inspected repository evidence.
- Put each evidence-backed decision in Required behavior or Contract, once.
- Limit Assumptions to facts nobody could verify and minor task decisions; an Assumptions line never holds a decision that changes required behavior, a public or persisted contract, security, external state, or scope, which belongs in Required behavior, Contract, or Blockers.
- Include every product and contract decision needed for execution.
- Make each task standalone, executable without the PRD and sibling tasks.
- Limit repository notes to verified entry points, binding contracts, and hidden wiring that affects decisions.
- State prerequisite capabilities and their required contracts inline, including contracts from indirect predecessors.
- Write each contract that several tasks state as an identical `### Shared:` block in each of them.
- Limit `Must preserve` to contracts the same task leaves unchanged.
- Leave routine, reversible implementation choices to the executor, and keep every material decision out of `Executor choices`.
- Name each blocker's missing decision or evidence and affected behavior.

## Acceptance and validation

- State each check's action, result, boundaries, and relevant failure behavior.
- Match each check's starting state to an inspected fixture, or have the check establish it.
- Cover permissions, recovery, replay, and concurrency when applicable.
- Name a command that exists now, or one that this task or a named predecessor creates, and its expected evidence.
- Name each tool a check needs that is not installed, and the manual check that replaces it.
- Keep validation local.

## Focus

- Preserve exact identifiers, values, units, commands, and scenario details.
- State each binding fact once in prose, and repeat it in Acceptance only as observable evidence.
- Keep only sentences that add product meaning, a contract, a boundary, evidence, or a completion check.

## Contract checks

For each task with contract risks, confirm that every applicable item of [contract-precision.md](contract-precision.md) passes or has a scoped blocker.
