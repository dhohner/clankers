# Next Best Thing Plugin

Recommends the single highest-leverage next improvement for the current repository using concrete repository evidence.

## What It Does

Copilot uses this user-invoked skill to identify one worthwhile next step instead of giving generic product advice. Produces a recommendation with:

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

See [the skill definition](./skills/next-best-thing/SKILL.md) for the exact response structure.

## Authors

[dhohner](https://github.com/dhohner)
