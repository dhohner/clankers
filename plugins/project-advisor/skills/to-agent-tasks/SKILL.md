---
name: to-agent-tasks
description: Convert accepted `to-prd` `prd.yaml` bundles into dependency-ordered, self-contained Markdown tasks for autonomous repository coding agents such as Codex or Pi. Use for requests that explicitly name coding-agent tasks or autonomous implementation work packages.
---

# PRD to Autonomous Tasks

Turn an accepted `prd.yaml` into a small set of tracer-bullet tasks that coding agents can execute with repository access but without the PRD or sibling task files.
Write tasks to `action-items/agent-tasks/` unless the user chooses another location.

## Invariants

- Proceed from a `prd.yaml` that the user or prior conversation marks accepted.
  When acceptance is unestablished, ask for confirmation and stop at this gate.
- Treat `prd.yaml` as the source of truth and `index.html` as a review surface.
- Ground behavior in `blocks.requirements` and the Gherkin scenarios they contain.
  Carry forward constraints, non-goals, risks, open questions, success measures, and validation links when they affect implementation or completion.
- Use `blocks.testing_strategy` as validation context inside behavioral tasks.
- Resolve material product and contract decisions from the PRD first and established repository behavior second.
  Turn any remaining material ambiguity into a focused question or explicit blocker.
- Preserve ordinary implementation choices for the executing agent while making behavior, durable contracts, boundaries, and completion evidence explicit.

## Process

1. **Gate and inventory the source.**
   Read the accepted manifest and build a coverage ledger of requirement IDs, scenarios, boundaries, dependencies, blockers, and validation evidence.
   This step is complete when every requirement and every material qualifier elsewhere in the PRD appears in the ledger.

2. **Inspect the repository.**
   Trace only the code, configuration, tests, and documentation needed to locate real integration points, conventions, data contracts, and safe validation commands.
   This step is complete when every candidate outcome has the applicable integration, convention, contract, and validation evidence needed for execution, with each material evidence gap recorded as a blocker.

3. **Design tracer bullets.**
   Read and apply [references/slice-design-checklist.md](references/slice-design-checklist.md), then map the coverage ledger into the smallest dependency-ordered slices that each deliver one observable outcome.
   This step is complete when every required behavior maps to at least one slice, every slice has focused completion evidence, and every dependency names a genuinely required predecessor capability.

4. **Run the contract branch.**
   For every slice that creates or changes durable records, state transitions, metering, audit history, inventory, retries, or authorization boundaries, read and apply [references/contract-precision.md](references/contract-precision.md).
   Resolve unknowns from source evidence or surface them before writing.
   This step is complete when the reference's completion criterion passes against the coverage ledger.

5. **Approve the breakdown.**
   Treat an explicit request to write files now, skip review, or assume approval as approval.
   Otherwise present each proposed task's title, outcome, covered requirement IDs, predecessor capabilities, and material blockers, then wait for approval.
   This step is complete when the conversation contains approval for the exact breakdown being written.

6. **Write autonomous task files.**
   Read [references/agent-task-template.md](references/agent-task-template.md) and [references/task-writing-checklist.md](references/task-writing-checklist.md), then apply them to one file per approved slice in dependency order, using names such as `01-short-task-title.md`.
   Describe required predecessor capabilities inside each dependent task rather than relying on task numbers or sibling files.
   This step is complete when every saved file passes every applicable quality-gate item.

7. **Report the handoff.**
   Summarize the created files, execution order, source-backed assumptions, and unresolved blockers.
   The handoff is complete when every created file and every unresolved blocker is accounted for.

Ask only for decisions that materially change scope, ordering, contracts, or acceptance.
