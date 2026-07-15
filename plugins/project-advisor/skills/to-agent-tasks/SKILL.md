---
name: to-agent-tasks
description: >-
  Convert an accepted to-prd prd.yaml bundle into dependency-ordered, self-contained Markdown implementation tasks for autonomous coding agents such as Codex or Pi.
  Use when the user asks to turn an accepted PRD into coding-agent tasks, autonomous work packages, implementation briefs, or executable implementation slices.
  Do not use for Jira tickets, live tracker items, PRD authoring, or unaccepted planning material.
---

# PRD to Agent Tasks

Turn an accepted `prd.yaml` into a small set of implementation tasks that coding agents can execute without opening the PRD.
Write tasks to `action-items/agent-tasks/` unless the user chooses another location.

## Source rules

Use `prd.yaml` as the source of truth, not the generated `index.html`.
If the PRD's acceptance status is unknown, confirm it before proceeding.
Do not invent behavior or constraints absent from the PRD and repository.

Use `blocks.requirements` and their Gherkin scenarios for required behavior and acceptance criteria.
Carry forward constraints, non-goals, risks, open questions, success measures, and validation links only when they affect implementation or completion.
Use `blocks.testing_strategy` as validation context rather than creating a separate testing task.

## Workflow

1. Read the accepted `prd.yaml` and extract behavior, boundaries, dependencies, blockers, and validation evidence.
2. Read `references/slice-design-checklist.md`, then define the smallest dependency-ordered vertical slices that each deliver one observable outcome.
3. Inspect only the repository areas needed to identify real integration points, conventions, data contracts, and validation commands.
4. Close behavior and contract ambiguities that would otherwise force the executing agent to make a product decision. Resolve them from the PRD first, then established repository behavior. Ask a focused question or mark a blocker when neither source answers them.
5. Unless the user has authorized direct file creation, present the proposed breakdown with each task's title, outcome, requirement IDs, predecessors, and material blockers, then obtain approval.
6. Read `references/agent-task-template.md` and `references/task-writing-checklist.md`, then write one file per approved task in dependency order, using names such as `01-short-task-title.md`.
7. Check every task against the writing checklist and summarize the files, execution order, assumptions, and unresolved blockers.

Ask only about decisions that materially change scope, ordering, or acceptance.

## Task rules

Each task must be actionable by a coding agent with repository access but no access to the PRD or other task files.
When a predecessor is required, describe the completed capability this task depends on rather than relying on a cross-file reference alone.

Follow the task template's section order and remove optional sections that have no content.
Each task must include:

- one observable outcome and a source-backed scope boundary;
- inspected, decision-relevant repository context;
- source-backed behavioral acceptance criteria, using Gherkin where it expresses the behavior clearly;
- concrete validation commands or focused checks; and
- a handoff requiring changed files, validation results, and unresolved blockers or assumptions.

Leave ordinary implementation choices to the executing agent.
Do not prescribe speculative architecture or a layer-by-layer build sequence.
Do not leave product semantics, durable contracts, edge behavior, or completion evidence as implementation choices.
Mark missing material decisions as blockers instead of making silent assumptions.
Present optional implementation ideas as non-binding context.

## Contract precision

Apply this section when a slice creates or changes durable records, state transitions, metering, audit history, inventory, retries, or authorization boundaries.
Keep the task technology-neutral unless a repository fact is needed to make it executable.

- Define controlled vocabularies and the meaning of every value. State whether values classify domain events, represent persisted state, label UI, or name operations so one concept is not mistaken for another.
- State the durable record contract needed by this slice and accepted successors: the repository-grounded entity name, field names and meanings, identifiers and relationships, optionality, units or precision, and lookup paths. Name concrete indexes only when confirmed by the repository or required by an accepted access pattern.
- Identify the authoritative observation time. Prefer a datastore-managed creation time when the repository provides one, and explicitly avoid a redundant application-managed timestamp unless the source requires distinct domain time.
- Preserve legacy values exactly when compatibility is required, including absent optional fields. Do not silently normalize, synthesize, or discard them.
- Spell out boundary behavior for values below, equal to, and above a threshold, plus already-missing state when relevant. State whether values are rejected, capped, retained, transitioned, or removed, and which durable event classification results.
- Make retry claims operation-specific. Naturally convergent operations may be replay-safe without a request identity; cumulative or decrementing operations generally need a caller-supplied action identity to distinguish a replay from a second intentional action. If no identity exists, narrow the guarantee instead of claiming generic idempotency.
- State which availability and invariant checks the server enforces even when the client also validates them. Define the amount recorded when a request exceeds available state and preserve any source-backed transition behavior.
- Require coupled state and history writes to occur in one atomic operation when partial success would violate the contract. Define rollback expectations and validate both success and failure paths.
- Scope isolation to interfaces introduced by the slice. If no read interface is added, require authenticated, tenant-scoped writes and direct persistence assertions rather than inventing a read API. If reads are in scope, state their authorization boundary explicitly.

Contract details must come from the PRD or repository evidence.
If an exact-zero rule, retry identity, event meaning, field optionality, access path, or authorization boundary materially affects behavior and remains unknown, surface it before writing or record it as a blocker.

Compress language where the meaning remains explicit.
Prefer short bullets and compact `cause -> effect -> action` notes for repository findings, constraints, and implementation context, for example: `Inline options object -> new ref each render -> memoized child rerenders. Stabilize the reference.`
Use complete sentences when fragments could obscure the actor, required behavior, condition, rationale, or scope boundary.
Never compress identifiers, commands, Gherkin, qualifiers, blockers, or acceptance details.
Avoid project-management prose, generic coding advice, placeholders, and references to unavailable source material or credentials.
