# PRD to Issues

Break a Product Requirements Document into independently-grabbable Jira-ready work items using tracer-bullet vertical slices.

The generated items are written for experienced developers. They describe desired behavior and verifiable outcomes rather than agent-style step sequences or layer-by-layer implementation checklists.

## What It Does

This skill converts a PRD into a set of Jira-ready markdown files:

1. **Locate the PRD** — reads the PRD from a workspace file or asks the user
2. **Explore the codebase** — understands the current state of the code (optional)
3. **Draft vertical slices** — breaks the PRD into thin end-to-end tracer-bullet slices, each demoable on its own
4. **Quiz the user** — presents the breakdown for review, iterates until approved
5. **Create Jira-ready markdown files** — writes one file per slice into `action-items/jira-issues/`

## Output Format

Each generated file uses Jira-compatible HTML panels:

- **User story header** — colored `Als / möchte ich / damit` format
- **Acceptance criteria** (`jePanel_info`) — one scenario panel per criterion, phrased as observable behavior
- **Scenario panels** (`jePanel_dashed`) — German Gherkin syntax with colored keywords (`Angenommen`, `Wenn`, `Dann`, `Und`)
- **Notes panel** (`jePanel_idea`) — concise implementation context, assumptions, dependencies, risks, and open questions without turning the item into an execution script

## Usage

```text
"Convert the PRD into Jira issues"
"Break this PRD down into work items"
"Create implementation tickets from the PRD"
```

## Bundled References

- `references/jira-issue-template.md` contains the authoritative Jira-compatible HTML template and formatting rules.
- `references/example-ticket.md` contains a fully worked sample ticket that demonstrates the expected phrasing and level of detail.

## Author

Daniel Hohner
