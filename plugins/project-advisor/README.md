# Project Advisor Plugin

Packages product-planning workflows grounded in repository evidence.

## What It Does

This plugin currently bundles three connected skills:

- `next-thing` identifies the single highest-leverage next product addition and presents it as a crisp Senior Product Manager recommendation.
- `to-prd` turns a feature idea into a structured English PRD through user interview, codebase exploration, and an automatic review loop.
- `to-issues` converts an approved PRD into German Jira-ready vertical-slice work items using the bundled Jira template and example ticket.

Together they support a natural workflow from product bet to approved PRD to implementation-ready work items.

## Usage

```text
"/next-thing"
"Write a PRD for this feature idea"
"Break this PRD into Jira-ready work items"
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

Skill documentation:

- [next-thing](./skills/next-thing/README.md)
- [to-prd](./skills/to-prd/README.md)
- [to-issues](./skills/to-issues/README.md)

## Authors

[dhohner](https://github.com/dhohner)
