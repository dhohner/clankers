# Project Advisor plugin

Project Advisor uses repository evidence to help plan product work.

## Skills

- `next-thing` recommends the next product addition with the greatest benefit, in the voice of a senior product manager.
- `to-prd` turns a feature idea into a structured English PRD by interviewing the user, inspecting the codebase, and running an automatic review loop.
- `to-issues` converts an approved PRD into German or English work items for Jira, each covering a vertical slice, using the bundled Jira template and example tickets.
- `to-agent-tasks` converts an accepted `prd.yaml` into standalone Markdown tasks for coding agents such as Codex or Pi, ordered by dependency.

## Workflow

![Project Advisor workflow. next-thing pitches one product bet. to-prd turns it into an accepted prd.yaml through a design-tree interview and a revision loop. Once the manifest reaches status Accepted, the work forks. to-issues writes German or English Jira slices, and to-agent-tasks writes self-contained tasks for autonomous coding agents. The task-executor plugin optionally implements one of those task files.](./assets/workflow.svg)

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
- "Break this PRD into Jira issues in English."

## Learn more

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
