# Project Advisor Plugin

Packages product-planning workflows grounded in repository evidence.

## What It Does

This plugin currently bundles three connected skills:

- `next-best-thing` identifies the single highest-leverage next product addition and presents it as a crisp Senior Product Manager recommendation.
- `write-a-prd` turns a feature idea into a structured English PRD through user interview, codebase exploration, and an automatic review loop.
- `prd-to-issues` converts an approved PRD into German Jira-ready vertical-slice work items using the bundled Jira template and example ticket.

Together they support a natural workflow from product bet to approved PRD to implementation-ready work items.

## Usage

```text
"/next-best-thing"
"Write a PRD for this feature idea"
"Break this PRD into Jira-ready work items"
```

Example prompts:

- "Inspect this repository and tell me the single highest-leverage next step."
- "Help me write a PRD for delegated approvals."
- "Convert this PRD into Jira-ready vertical slices."

## Learn More

Bundled skills:

- `next-best-thing`
- `write-a-prd`
- `prd-to-issues`

Skill documentation:

- [next-best-thing](./skills/next-best-thing/README.md)
- [write-a-prd](./skills/write-a-prd/README.md)
- [prd-to-issues](./skills/prd-to-issues/README.md)

## Authors

[dhohner](https://github.com/dhohner)
