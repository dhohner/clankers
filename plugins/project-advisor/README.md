# Project Advisor Plugin

Packages product-planning workflows grounded in repository evidence.

## What It Does

This plugin currently bundles four connected skills:

- `next-thing` identifies the single highest-leverage next product addition and presents it as a crisp Senior Product Manager recommendation.
- `to-prd` turns a feature idea into a structured English PRD through user interview, codebase exploration, and an automatic review loop.
- `to-issues` converts an approved PRD into German Jira-ready vertical-slice work items using the bundled Jira template and example ticket.
- `to-agent-tasks` converts an accepted `prd.yaml` into dependency-ordered, self-contained Markdown tasks for coding agents such as Codex or Pi.

Together they support a natural workflow from product bet to approved PRD to implementation-ready work items.

## Workflow

![Project Advisor workflow: next-thing pitches one product bet, to-prd turns it into an accepted prd.yaml through a design-tree interview and a revision loop, and once the manifest reaches status Accepted the work forks into to-issues, which writes German Jira slices, and to-agent-tasks, which writes self-contained tasks for autonomous coding agents.](./assets/workflow.svg)

## Usage

```text
"/next-thing"
"Write a PRD for this feature idea"
"Break this PRD into Jira-ready work items"
"Create coding-agent tasks from this accepted prd.yaml"
```

Example prompts:

- "Inspect this repository and tell me the single highest-leverage next step."
- "Help me write a PRD for delegated approvals."
- "Convert this PRD into Jira-ready vertical slices."

## Learn More

Bundled skills:

- `next-thing`
- `to-prd`
- `to-issues`
- `to-agent-tasks`

Skill documentation:

- [next-thing](./skills/next-thing/README.md)
- [to-prd](./skills/to-prd/README.md)
- [to-issues](./skills/to-issues/README.md)
- [to-agent-tasks](./skills/to-agent-tasks/README.md)

## Authors

[dhohner](https://github.com/dhohner)
