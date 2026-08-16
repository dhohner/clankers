# PRD to Agent Tasks

Turn an accepted `to-prd` `prd.yaml` bundle into dependency-ordered, self-contained Markdown implementation tasks for autonomous coding agents such as Claude Code, Codex, or Pi.

## What It Does

This skill converts an accepted PRD into a small set of executable tracer-bullet slices:

1. **Read the source manifest** - uses `prd.yaml` as the source of truth rather than the generated `index.html`.
2. **Extract implementation boundaries** - carries forward required behavior, Gherkin scenarios, constraints, non-goals, risks, open questions, success measures, and validation context when they affect delivery.
3. **Inspect repository context** - identifies the real integration points, conventions, data contracts, and validation commands needed by each task.
4. **Design dependency-ordered slices** - creates the smallest set of tasks that each deliver one observable outcome.
5. **Partition authority** - gives every material decision one disposition: fixed by source evidence, delegated to the executing agent, or escalated as a blocker, and asks focused questions when the PRD and repository do not settle a product or contract decision.
6. **Write autonomous task files** - produces one Markdown file per approved task, with enough context for an agent that cannot access the PRD or other task files.

## Input and Output

The source must be an accepted `prd.yaml` bundle.
If acceptance is unknown, the skill confirms it before creating tasks.

By default, task files are written to:

```text
action-items/agent-tasks/
├── 01-short-task-title.md
├── 02-next-task-title.md
└── ...
```

Each task includes:

- one observable outcome and the source-backed required behavior;
- a boundary: what the task may change, what must survive intact, which choices are the executing agent's own, and labeled assumptions and blockers;
- inspected repository notes that point at entry points and binding contracts rather than touring the code;
- behavioral acceptance checks preserving every assigned source scenario;
- concrete validation commands or focused checks; and
- a standing stop rule: record the choices the task leaves open, and stop and report at any decision it does not settle.

Tasks are written for frontier coding agents, not as Jira tickets or implementation checklists.
They stay succinct: they state outcomes and constraints instead of implementation steps, omit what the agent can rediscover in the repository, and skip generic engineering advice.
They leave ordinary implementation choices to the executing agent while making product semantics, durable contracts, edge behavior, and completion evidence explicit.
Because the executing agent cannot ask a follow-up question, each task states where its authority ends: an agent that reaches a decision the task does not settle stops and reports it rather than widening scope or inventing one.

## Usage

```text
"Create coding-agent tasks from the accepted prd.yaml"
"Turn this accepted PRD into autonomous implementation tasks"
"Break the accepted PRD into dependency-ordered work packages for Pi"
```

Unless direct file creation is authorized, the skill first presents the proposed breakdown for approval.
The proposal includes each task's title, outcome, requirement IDs, predecessors, and material blockers.

## Bundled References

- `references/slice-design-checklist.md` defines tracer-bullet slices, sequencing, and when to combine or split work.
- `references/contract-precision.md` defines durable record, boundary, retry, atomicity, and isolation rules for contract-sensitive slices.
- `references/agent-task-template.md` is the authoritative Markdown structure for generated tasks.
- `references/task-writing-checklist.md` is the final quality gate for source grounding, autonomy, acceptance, validation, and succinctness.

## File Structure

The skill keeps its guidance inside the skill directory so it packages cleanly:

- `SKILL.md` handles triggering, source invariants, the phased process, and context pointers.
- `references/` holds the slice-design checklist, conditional contract guidance, task template, and writing quality gate.

## Boundaries

This skill does not author PRDs, split work into Jira issues, create live tracker items, or proceed from unaccepted planning material.
It uses `blocks.testing_strategy` as validation context rather than creating a separate testing task.

## Author

Daniel Hohner
