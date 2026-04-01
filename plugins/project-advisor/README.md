# Project Advisor Plugin

Packages repository planning and recommendation workflows grounded in concrete repository evidence.

## What It Does

The included `next-best-thing` skill identifies one worthwhile next step instead of giving generic product advice. It returns:

- Evidence gathered from the current repository structure and files
- A clear explanation of why this improvement matters now
- Alternatives considered before choosing the recommendation
- A concrete outline of what the addition could look like

## Usage

```text
"/next-best-thing"
"Run /next-best-thing on this repo"
"Use /next-best-thing when you want one evidence-backed roadmap idea"
```

Copilot will inspect the repository and return a single recommendation with rationale, evidence, impact, and confidence.

## Learn More

Current bundled skill:

- `next-best-thing`

See [the skill definition](./skills/next-best-thing/SKILL.md) for the exact response structure.

## Authors

[dhohner](https://github.com/dhohner)
