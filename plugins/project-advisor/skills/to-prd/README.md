# Write a PRD

Turns a rough idea or partial brief into a structured Product Requirements Document through a focused interview, codebase exploration, and module design — then saves it as a PRD file.

## How it works

The skill treats the interview as the main work. It keeps asking until the problem, users, scope, constraints, and module shape are all concrete. Only then does it write.

1. **Capture seed context** — extracts what is already known from the conversation before asking anything new
2. **Explore the codebase** — verifies existing patterns, naming, and constraints that the brief may not mention
3. **Run the interview** — drills into unresolved decision clusters, round by round, until shared understanding is solid
4. **Sketch the solution shape** — proposes the major modules or capability areas and confirms them with the user
5. **Draft the PRD** — produces a structured document from the bundled template
6. **Review loop** — self-reviews inline, then dispatches a reviewer subagent to catch completeness, consistency, and scope issues before asking the user

## PRD structure

Every generated PRD includes these sections:

- **Problem Statement** — the problem from the user's perspective
- **Solution** — the proposed approach
- **User Stories** — broad coverage across all relevant actors and scenarios
- **Implementation Decisions** — modules, interfaces, schema changes, API contracts
- **Testing Decisions** — what to test, how, and relevant prior art in the codebase
- **Out of Scope** — explicit boundaries
- **Further Notes** — assumptions, open questions, and rollout notes (populated only when there is material to include)

## Bundled references

- `references/interview-map.md` — decision clusters used to guide the interview
- `references/prd-template.md` — section structure and writing guidance
- `references/review-checklist.md` — quality criteria applied before user review

## Usage

```text
"Write a PRD for this new feature"
"Help me plan this — let's do a PRD"
"I need a product requirements document for X"
```

Once the PRD is approved, the skill offers to break it into Jira-ready work items using the `to-issues` skill.

## Language

PRDs are always written in English.

## Author

Daniel Hohner
