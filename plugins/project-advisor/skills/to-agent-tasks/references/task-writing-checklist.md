# Autonomous task quality gate

Check every applicable item against the complete task before saving it.

## Template and outcome

- The task follows [agent-task-template.md](agent-task-template.md), contains every required section, removes unused optional sections, and contains no placeholders.
- The title and outcome describe one observable completed behavior and its value.
- Scope contains exactly the behavior and boundaries needed for that outcome.

## Coverage and grounding

- Every statement is traceable to the PRD, inspected repository evidence, or a clearly labeled assumption or blocker.
- The task survives an airgapped executor: it embeds every product decision an agent needs when its only external context is repository access, and never points at the PRD, sibling task files, or task numbers.
- Every ledger item assigned to the slice appears in scope, acceptance, validation, or an explicit blocker.

## Execution autonomy

- Repository paths, symbols, contracts, conventions, and commands come from inspection.
- Claims about repository wiring or behavior are verified in the code; a plausible convention that inspection does not confirm is stated as absent or as an assumption, not as fact.
- Repository context includes only decision-relevant facts and clearly labels non-binding implementation options.
- Dependencies name completed predecessor capabilities and explain why this outcome needs them.
- Prerequisite capabilities are described by their guaranteed contract; an implementation choice left non-binding in any task stays non-binding in every task that mentions it.
- Product semantics, edge behavior, durable contracts, and completion evidence are explicit.
- Architecture, framework, and implementation choices remain open wherever source evidence leaves them open.

## Delegation boundary

- Every material decision the task touches is fixed by source or repository evidence, explicitly delegated to the executing agent, or named as a blocker, and none is left silently ambiguous.
- Choices the task leaves open are stated as open rather than implied by omission, so the agent spends no effort reconstructing a preference that does not exist.
- A decision that neither the PRD nor the repository settles, but the task settles anyway to stay executable, is labeled inside the task file as an assumption rather than presented as established fact; recording it only in the conversation summary does not count, because the executing agent never sees that summary.
- When the task changes artifacts, configuration, or behavior that something else depends on, it names what may change and the invariants a reasonable executor might plausibly break, without restating sections the task already contains.
- The invariants a task declares intact are consistent with the changes that same task makes; an invariant its own required behavior violates strands the executor between two instructions it cannot both satisfy.
- Where a task preserves something it also changes, the invariant names the properties that survive - field names, meanings, ordering, existing values, status codes - because a blanket "behaves exactly as it does today" is contradicted on its face by the same task adding to that behavior, and leaves the executor guessing whether an existing assertion should be amended or reported as a failure.
- A blocker names the narrowest unresolved decision, and the task still delivers the behavior that blocker does not prevent, instead of deferring a whole requirement because one of its inputs is missing.
- The handoff directs the agent to stop and report at a decision the task does not settle, rather than widen scope or invent one.

## Acceptance

- Every source scenario assigned to the slice is preserved semantically in at least one acceptance scenario.
- Scenarios state relevant starting state, action, and observable result in behavioral, technology-neutral language.
- Scenario starting state agrees with inspected repository fixture data, or the scenario explicitly establishes the state it assumes.
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
- Within one file a binding fact lives in the section that owns it, and the other prose sections refer to it rather than restating it; acceptance scenarios still re-express behavior as observable evidence, which is their job.
  Restating the same rule in several sections is not merely long: the copies drift, and an executor reconciling two versions of one rule pages apart is being asked to decide something nobody decided.

## Contract branch

When the contract branch applies, the task satisfies the completion criterion in [contract-precision.md](contract-precision.md).

## Completion criterion

The task passes when every applicable item above is directly verifiable in the saved file.
Represent source or repository evidence gaps as explicit blockers and correct every other failed check before saving.
