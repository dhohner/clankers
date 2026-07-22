---
name: to-agent-tasks
description: Create self-contained, dependency-ordered coding-agent tasks from accepted `to-prd` `prd.yaml` bundles. Use when the user explicitly requests autonomous implementation work packages.
---

# Accepted PRD to Agent Tasks

Convert one explicitly accepted `prd.yaml` into a small set of tracer-bullet Markdown tasks that coding agents can execute with repository access alone.
Write tasks to `action-items/agent-tasks/` unless the user chooses another destination.

## Process

### 1. Gate the source and build the coverage ledger

Locate the requested `prd.yaml` and require explicit acceptance from the user or prior conversation.
Source acceptance is independent of later breakdown approval.
When acceptance is unestablished, ask for confirmation and stop at this gate.

Treat `prd.yaml` as the source of truth and `index.html` as its review surface.
Build a coverage ledger containing every requirement ID, every Gherkin scenario, and every implementation-relevant constraint, non-goal, decision, risk, open question, success measure, dependency, and validation link.
Ground behavior in `blocks.requirements` and its Gherkin scenarios, carrying other blocks forward only when they constrain implementation, acceptance, sequencing, or validation.
Give each item a disposition: implementation candidate, validation context, blocker, or source-backed reason that it requires no implementation work.

**Complete when:** every ledger item has exactly one explicit disposition and every unresolved material decision is visible.

### 2. Design tracer bullets

Read and apply [references/slice-design-checklist.md](references/slice-design-checklist.md).
Map the ledger into the smallest set of outcome slices and express every dependency as a predecessor capability.
Use `blocks.testing_strategy` as validation context within behavioral slices.

**Complete when:** the slice-design reference's completion criterion passes against the coverage ledger.

### 3. Ground each slice in the repository

For each candidate slice, inspect the bounded code, configuration, tests, migrations, and documentation needed to identify real integration points, conventions, existing contracts, and validation commands.
Revise the slices when repository evidence reveals a coupling, boundary, or independently verifiable capability that changes the breakdown.
Record evidence gaps as exact blockers rather than inferred facts.

**Complete when:** every slice has inspected integration evidence and a safe validation path, or a named evidence gap that blocks execution.

### 4. Run the contract branch

For each slice involving durable data, state transitions, thresholds, time, retries, concurrency, coupled writes, external side effects, authorization, or tenant isolation, read and apply [references/contract-precision.md](references/contract-precision.md).
Resolve material product and contract decisions from the PRD first and established repository behavior second.
Surface each remaining material decision as a focused question or named blocker before drafting.

**Complete when:** every triggered slice passes the contract reference's completion criterion.

### 5. Approve the exact breakdown

Treat an explicit request to write files now, skip breakdown review, or assume approval as breakdown approval.
Otherwise present each proposed task's title, observable outcome, covered requirement IDs, prerequisite capabilities, and material blockers, then wait for approval.

**Complete when:** the conversation approves the exact breakdown that will be written.

### 6. Write and audit autonomous task files

Read [references/agent-task-template.md](references/agent-task-template.md) and [references/task-writing-checklist.md](references/task-writing-checklist.md).
Inspect the destination, preserve existing files, and choose non-colliding dependency-ordered names such as `01-short-task-title.md`.
Write one file per approved slice with all needed product context, repository findings, prerequisite capability contracts, and completion evidence.
Describe prerequisite capabilities inside dependent tasks so execution never relies on sibling task files or task numbers.
Fix observable behavior, durable contracts, boundaries, and completion evidence while leaving ordinary implementation choices to the executing agent.
Audit every draft against the coverage ledger and every applicable quality-gate item before saving it.

**Complete when:** every approved slice has one saved task, every ledger item remains accounted for, every task passes the quality gate, and no existing file was replaced without explicit authorization.

### 7. Report the handoff

Report the created files in execution order, source-backed assumptions, and unresolved blockers.

**Complete when:** every created file and every unresolved blocker is accounted for.

Ask only for decisions that materially change scope, ordering, contracts, or acceptance.
