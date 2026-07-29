# Autonomous task quality gate

Check every applicable item against the complete task before saving it.

## Template and outcome

- The task follows [agent-task-template.md](agent-task-template.md), contains every required section, removes unused optional sections, and contains no placeholders.
- The title and outcome describe one observable completed behavior and its value.
- Scope contains exactly the behavior and boundaries needed for that outcome.

## Coverage and grounding

- Every statement is traceable to the PRD, inspected repository evidence, or a clearly labeled assumption or blocker.
- The task is self-contained: it embeds every product decision an agent needs when its only external context is repository access.
- Every ledger item assigned to the slice appears in scope, acceptance, validation, or an explicit blocker.

## Execution autonomy

- Repository paths, symbols, contracts, conventions, and commands come from inspection.
- Repository context includes only decision-relevant facts and clearly labels non-binding implementation options.
- Dependencies name completed predecessor capabilities and explain why this outcome needs them.
- Product semantics, edge behavior, durable contracts, and completion evidence are explicit.
- Architecture, framework, and implementation choices remain open wherever source evidence leaves them open.

## Acceptance

- Every source scenario assigned to the slice is preserved semantically in at least one acceptance scenario.
- Scenarios state relevant starting state, action, and observable result in behavioral, technology-neutral language.
- Scenarios cover material success, exact boundaries, failure behavior, permissions, and recovery applicable to the outcome.
- Added scenarios are direct implications of source-backed behavior.

## Validation and handoff

- Validation names concrete commands or focused checks and the expected evidence for completion.
- Commands exist in the inspected repository and are scoped to local or isolated execution when credentials, deployment, migration, upload, or remote mutation are possible.
- New-behavior evidence and directly relevant regression checks are distinguishable.
- Manual validation includes the observable procedure and expected result.
- The handoff requests changed files, exact commands with observed results, manual observations, and unresolved blockers or assumptions.

## Precision

- Identifiers, values, units, commands, qualifiers, and Gherkin details remain exact.
- Compact prose preserves actor, condition, behavior, rationale, and boundary.
- Every sentence contributes decision-relevant execution context.

## Contract branch

When the contract branch applies, the task satisfies the completion criterion in [contract-precision.md](contract-precision.md).

## Completion criterion

The task passes when every applicable item above is directly verifiable in the saved file.
Represent source or repository evidence gaps as explicit blockers and correct every other failed check before saving.
