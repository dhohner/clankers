# Autonomous task quality gate

Check every applicable item before saving a task.

## Structure and coverage

- The task follows [agent-task-template.md](agent-task-template.md), keeps every required section, removes unused optional content, and has no placeholders.
- The frontmatter is valid YAML whose model category and effort follow the `SKILL.md` policy and whose `selection_rationale` gives task-specific signals for both choices.
- The title and Outcome define one observable result and its value.
- Required behavior and Boundary contain only what that result needs.
- Every assigned ledger item appears in behavior, acceptance, validation, another mapped slice, or a blocker.
- The union of split tasks preserves every clause and scenario from the source requirement.

## Evidence and autonomy

- Every claim comes from the PRD, inspected repository evidence, or a labeled assumption or blocker.
- The task contains every required product decision and never refers the executor to the PRD, sibling tasks, or task numbers.
- Repository notes contain only verified entry points, binding contracts, and non-obvious wiring that affects a decision.
- Dependencies describe required predecessor capabilities and why they are needed, not files or task order.
- Shared prerequisite contracts agree on fields, meanings, status codes, ordering, and other fixed properties, and a choice left non-binding in one task stays non-binding in every task that mentions it.
- Architecture and implementation remain open unless evidence fixes them or a suggestion is labeled non-binding.

## Delegation boundary

- Every material decision is fixed by evidence, delegated under Your call, or escalated under Blockers.
- Every unsupported decision introduced by the task appears under Assumptions.
- May change and Must survive name the precise change surface and the specific surviving properties - field names, meanings, status codes, ordering, existing values - rather than a blanket "behaves as today" claim; an invariant that the task's own changes violate fails this check.
- Each blocker names the unresolved decision, needed evidence, and only the behavior that must wait.
- The task tells the executor to record delegated choices and stop at unsettled decisions instead of widening scope or inventing answers.

## Acceptance and validation

- Acceptance preserves every assigned source scenario as a technology-neutral check of state, action, and observable result.
- Starting states match inspected fixtures or the check establishes them.
- Checks cover applicable success, exact boundaries, failures, permissions, recovery, replay, and concurrency.
- Added checks follow directly from source-backed behavior.
- Checks are plain checkable statements, with no Given/When/Then syntax required.
- Validation names existing local commands or focused manual steps and their expected evidence.
- Validation distinguishes new-behavior evidence from relevant regression coverage and avoids unauthorized remote effects.

## Precision and brevity

- Identifiers, values, units, commands, qualifiers, and scenario details remain exact.
- Each binding fact appears once in its owning prose section, while Acceptance expresses it as observable evidence.
- Every sentence supplies product meaning, a contract, a boundary, evidence, or a completion check.
- The task omits generic engineering advice and repository facts that one search can recover.
- The task avoids implementation steps, layouts, algorithms, and data structures unless fixed or explicitly non-binding.
- A task beyond about 100 lines justifies the extra lines with unique, decision-relevant content.

## Contract branch

When the contract branch applies, the task passes [contract-precision.md](contract-precision.md).

## Completion criterion

The task passes when every applicable item is directly verifiable.
Convert evidence gaps into blockers and correct all other failures before saving.
