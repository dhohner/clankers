# Write a PRD

Turns a rough idea or partial brief into a structured Product Requirements Document through a focused interview, codebase exploration, and module design — then saves it as a styled HTML PRD file that is easy to review in a browser.

## How it works

The skill treats the interview as the main work. It keeps asking until the problem, users, scope, constraints, and module shape are all concrete. It uses code and domain docs to sharpen the brief, but keeps the PRD as the main deliverable. Only then does it write.

1. **Capture seed context** — extracts what is already known from the conversation before asking anything new
2. **Explore the codebase** — verifies existing patterns, naming, domain documentation, durable decisions, and constraints that the brief may not mention
3. **Run the interview** — drills into unresolved decision clusters, challenges ambiguous terminology against docs and code, pressure-tests fuzzy boundaries with concrete scenarios, and keeps documentation follow-ups secondary to the PRD
4. **Sketch the solution shape** — proposes the major modules or capability areas and confirms them with the user
5. **Draft the PRD** — produces a styled HTML document from the bundled template
6. **Review loop** — self-reviews inline, runs a reviewer subagent when available, makes the generated HTML PRD available for review, then asks the user to accept or request changes

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
- `references/prd-template.html` — styled HTML layout, section structure, and writing guidance
- `references/review-checklist.md` — quality criteria applied before user review

## Usage

```text
"Write a PRD for this new feature"
"Help me plan this — let's do a PRD"
"I need a product requirements document for X"
```

Once the PRD is approved, the skill offers to hand it off to the `to-issues` skill to break it into Jira-ready work items.

## Language

PRDs are always written in English.

## Author

Daniel Hohner
