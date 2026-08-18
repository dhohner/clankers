---
name: to-agent-tasks
description: Convert an accepted `to-prd` `prd.yaml` bundle into self-contained, dependency-ordered tracer-bullet tasks for autonomous coding agents. Use when the user asks to break an accepted PRD into coding-agent tasks for an autonomous agent such as Claude Code, Codex, or Pi. For Jira or tracker tickets, use `to-issues`.
---

# Accepted PRD to Agent Tasks

Convert one accepted `prd.yaml` into a small set of Markdown tasks for an airgapped coding agent.
The executor has repository access and one task file, but cannot ask follow-up questions.
Write to `action-items/agent-tasks/` unless the user chooses another destination.
Ask only about decisions that change scope, order, contracts, or acceptance.

## Delegation boundary

- Give every material decision one disposition: **Fixed** by evidence, **Delegated** to the executor, or **Escalated** as a named blocker.
- Label any decision you introduce without PRD or repository support as an assumption inside the task.
- Scope blockers to the exact behavior they prevent, and keep all other deliverable behavior in the task.
- Name what may change and the specific contracts or behavior that must survive.

## Process

### 1. Gate the source and build the ledger

Use `prd.yaml` as the source of truth and `index.html` only as its review surface.
Require top-level `status: Accepted` or explicit user acceptance.
If acceptance is unknown, ask for it and stop.
If the user accepts a draft manifest, point them to `to-prd` so it can publish that state.

Record every requirement ID, Gherkin scenario, and implementation-relevant constraint, non-goal, decision, risk, question, success measure, dependency, and validation link.
Use `blocks.requirements` for behavior.
Include other blocks only when they affect implementation, acceptance, sequence, or validation.
Classify each ledger item as implementation, validation context, blocker, or no implementation work.

**Complete when:** every ledger item has one disposition and every material uncertainty is visible.

### 2. Design tracer bullets

Read and apply [references/slice-design-checklist.md](references/slice-design-checklist.md).
Map the ledger to the smallest set of outcome slices.
Express dependencies as required predecessor capabilities.
Keep `blocks.testing_strategy` with the behavior it validates.

**Complete when:** the reference's completion criterion passes against the ledger.

### 3. Ground each slice

Inspect only the code, configuration, tests, migrations, and documentation needed for each slice.
Identify real entry points, binding contracts, conventions, dependencies, and safe validation commands.
Revise the breakdown when repository evidence reveals a material coupling or boundary.
Record evidence gaps as blockers, not facts.

**Complete when:** every slice has inspected integration evidence and safe validation, or a precise blocker.

### 4. Resolve contract-sensitive slices

For durable data, state, thresholds, time, retries, concurrency, coupled writes, external effects, authorization, or tenant isolation, read and apply [references/contract-precision.md](references/contract-precision.md).
Resolve decisions from the PRD first and established repository behavior second.
Delegate deliberately open choices and escalate missing product or contract decisions.

**Complete when:** every triggered slice passes the contract reference.

### 5. Approve the breakdown

Treat a request to write now, skip review, or assume approval as approval.
Otherwise present each task's title, outcome, requirement IDs, prerequisite capabilities, and blockers.
Wait for approval.

**Complete when:** the user approves the exact breakdown.

### 6. Write, audit, and report

Read [references/agent-task-template.md](references/agent-task-template.md) and [references/task-writing-checklist.md](references/task-writing-checklist.md).
Inspect the destination and preserve existing files unless the user explicitly authorizes replacement.
Use non-colliding dependency-ordered names such as `01-short-task-title.md`.
Write one self-contained file per approved slice and describe prerequisite contracts inline.
Assign each task a frontmatter model category, effort, and one-sentence rationale for both choices.
Use **frontier** (e.g. Claude Opus) for contract-sensitive, high-ambiguity, or architecture-shaping slices and **standard** (e.g. Claude Sonnet) otherwise.
Pick the first matching effort: `xhigh` when errors could corrupt durable data or break contracts that successor tasks depend on; `high` for other frontier or multi-contract slices; otherwise `medium`.
Audit each file against the ledger and every applicable checklist item before saving it.

Report files in execution order, labeled assumptions, and unresolved blockers.

**Complete when:** all approved tasks exist, all ledger items remain covered, every task passes the audit, no existing file was replaced without explicit authorization, and the report accounts for every file and blocker.
