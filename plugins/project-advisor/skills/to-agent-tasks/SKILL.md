---
name: to-agent-tasks
description: Convert an accepted `to-prd` `prd.yaml` bundle into self-contained, dependency-ordered tracer-bullet tasks for autonomous coding agents. Use when the user asks to break an accepted PRD into coding-agent tasks for an autonomous agent such as Codex or Pi. For Jira or tracker tickets, use `to-issues`.
---

# Accepted PRD to Agent Tasks

Convert one explicitly accepted `prd.yaml` into a small set of tracer-bullet Markdown tasks for an airgapped executor: a coding agent with repository access and this one task file, nothing else.
Write tasks to `action-items/agent-tasks/` unless the user chooses another destination.
Ask only for decisions that materially change scope, ordering, contracts, or acceptance.

## The delegation boundary

A task file is bounded delegated work, and the agent receiving it cannot ask a follow-up question.
Its usefulness depends less on how much it says than on how cleanly it partitions authority, so give every material decision a task touches exactly one disposition:

- **Fixed** - settled by the PRD or inspected repository evidence, stated exactly, and not open to reinterpretation.
- **Delegated** - genuinely the executing agent's call, said out loud so no effort goes into inferring a preference that does not exist.
- **Escalated** - unresolved, named as a blocker together with the decision and the evidence needed to settle it.

A decision you settle yourself to keep a task executable is an assumption, not a fixed fact, and it belongs in the task file labeled as one.
The executing agent never sees the summary you give the user, so an assumption recorded only in conversation is invisible at exactly the moment someone could catch it being wrong.

Escalate the narrowest thing that is genuinely unresolved.
A missing input rarely blocks a whole outcome, so deliver the behavior it does not prevent and place the blocker at the exact point where progress stops.
Handing back a whole requirement because one of its inputs is missing returns work that could have shipped.

Draw the change surface with the same care wherever a task touches artifacts, configuration, or behavior that something else depends on: name what it may create or modify and what must survive intact.
An agent that knows where its authority ends stops at that edge and reports, instead of widening scope or inventing a decision nobody made.

## Process

### 1. Gate the source and build the coverage ledger

Locate the requested `prd.yaml` and establish acceptance: a top-level `status` of `Accepted`, or explicit acceptance from the user or prior conversation.
Source acceptance is independent of later breakdown approval.
When acceptance is unestablished, ask for confirmation and stop at this gate; when the user confirms a PRD whose manifest still reads as a draft, point them at `to-prd` so the acceptance gets published.

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
Separate decisions the source deliberately leaves open, which are delegated, from decisions it fails to settle, and surface each of the latter as a focused question or named blocker before drafting.

**Complete when:** every triggered slice passes the contract reference's completion criterion.

### 5. Approve the exact breakdown

Treat an explicit request to write files now, skip breakdown review, or assume approval as breakdown approval.
Otherwise present each proposed task's title, observable outcome, covered requirement IDs, prerequisite capabilities, and material blockers, then wait for approval.

**Complete when:** the conversation approves the exact breakdown that will be written.

### 6. Write and audit autonomous task files

Read [references/agent-task-template.md](references/agent-task-template.md) and [references/task-writing-checklist.md](references/task-writing-checklist.md).
Inspect the destination, preserve existing files, and choose non-colliding dependency-ordered names such as `01-short-task-title.md`.
Write one file per approved slice for an airgapped executor: embed all needed product context, repository findings, prerequisite capability contracts, and completion evidence, and describe prerequisite capabilities inside each dependent task.
Fix observable behavior, durable contracts, and completion evidence; name the choices the executing agent owns instead of leaving them silently open; and state the change surface wherever collateral change would damage something this task does not own.
Audit every draft against the coverage ledger and every applicable quality-gate item before saving it.

**Complete when:** every approved slice has one saved task, every ledger item remains accounted for, every material decision in a task carries exactly one disposition, every task passes the quality gate, and no existing file was replaced without explicit authorization.

### 7. Report the handoff

Report the created files in execution order, source-backed assumptions, and unresolved blockers.

**Complete when:** every created file and every unresolved blocker is accounted for.
