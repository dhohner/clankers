# Autonomous task quality gate

Every applicable item must pass before a task file is saved.

## Outcome and grounding

- The task states one observable outcome and the source-backed behavior needed to deliver it.
- The task is understandable with repository access alone and embeds all needed PRD context and prerequisite capability contracts.
- Requirement IDs are retained only where they provide useful traceability.
- Hard constraints, non-goals, assumptions, blockers, and non-binding implementation ideas are distinguishable.
- Every template placeholder has been replaced or its optional section removed.

## Execution autonomy

- Repository findings, paths, contracts, and commands come from inspection rather than inference.
- Dependencies describe completed prerequisite capabilities and explain why this outcome needs them.
- Product semantics, edge behavior, durable contracts, and completion evidence are explicit.
- Architecture, framework, and implementation choices remain open unless source evidence constrains them.
- The task describes an end-to-end outcome rather than a layer-by-layer build sequence.

## Acceptance and validation

- Acceptance criteria are observable, source-backed, and cover the important success, boundary, and failure behavior.
- Gherkin scenarios identify the relevant starting state, action, and observable result without prescribing implementation.
- Validation names concrete commands or focused checks and the evidence that establishes completion.
- The handoff requires changed files, exact validation commands with observed results, and unresolved blockers or assumptions.

## Precision and style

- Repository findings and constraints use compact bullets or `cause -> effect -> action` notes only where the actor, behavior, condition, rationale, and boundary stay unambiguous.
- Identifiers, commands, Gherkin, qualifiers, blockers, and acceptance details remain exact.
- Every sentence contributes execution context instead of project-management framing, generic coding advice, or unavailable material.

## Contract branch

When the contract branch applies, confirm that the saved task meets the completion criterion in [contract-precision.md](contract-precision.md).
