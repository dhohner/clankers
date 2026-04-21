# Write a PRD

Create a Product Requirements Document through structured user interview, codebase exploration, and module design — then save it as a Jira-ready action item.

## What It Does

This skill guides you through a collaborative PRD writing process:

1. **Gather context** — asks for a detailed description of the problem and potential solutions
2. **Explore the codebase** — verifies assertions and understands current state
3. **Interview relentlessly** — walks down each branch of the design tree, resolving dependencies between decisions
4. **Design modules** — sketches major modules to build or modify, looking for deep module extraction opportunities
5. **Write the PRD** — produces a structured document and saves it as a Jira-ready action item
6. **Self-review and auto-review** — runs an inline quality pass, then a reviewer subagent loop before handing the PRD back to the user

## PRD Structure

The generated PRD includes:

- **Problem Statement** — the problem from the user's perspective
- **Solution** — the proposed solution from the user's perspective
- **User Stories** — extensive list covering all aspects of the feature
- **Implementation Decisions** — modules, interfaces, architecture, schema changes, API contracts
- **Testing Decisions** — what to test, how, and prior art in the codebase
- **Out of Scope** — explicit boundaries
- **Further Notes** — additional context

Before the PRD is considered ready, the skill now performs an automatic review loop modeled on the `brainstorming` skill's document review flow: write the document, self-review it, dispatch a reviewer subagent, fix any blocking issues, and only then ask the user for final review.

## Language

The PRD is always written in English.

- Do not switch to German even if downstream Jira stories or tickets are expected to be in German — that conversion happens in the ticket-writing step.
- Keep proper nouns, product names, and established technical terms as-is rather than translating them.

## Usage

```text
"Write a PRD for this new feature"
"Help me create a product requirements document"
"I need to plan a new feature — let's write a PRD"
```

## Author

Daniel Hohner
