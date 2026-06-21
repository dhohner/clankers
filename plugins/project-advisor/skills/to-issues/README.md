# PRD to Issues

Break a Product Requirements Document into independently-grabbable Jira-ready work items using tracer-bullet vertical slices.

The generated items are written for experienced developers. They describe desired behavior and verifiable outcomes rather than agent-style step sequences or layer-by-layer implementation checklists.

## What It Does

This skill converts a PRD into a set of Jira-ready markdown files:

1. **Locate the PRD** — reads the PRD from a workspace file or asks the user, preferring `prd.json` from a `to-prd` bundle over the rendered `index.html` when both exist; use `fast` mode for planning prose or feature briefs that are not packaged as `to-prd` artifacts
2. **Explore the codebase** — verifies the current workflow, terminology, and constraints before splitting work
3. **Draft vertical slices** — breaks the PRD or feature brief into thin end-to-end tracer-bullet slices, each demoable on its own
4. **Review only what matters** — runs a full approval loop in `default` mode and a minimal clarification loop in `fast` mode
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
"Split the accepted prd.json from the to-prd bundle into Jira-ready slices"
```

## Bundled References

- `references/jira-issue-template.md` contains the authoritative Jira-compatible HTML template and formatting rules.
- `references/example-ticket.md` contains a fully worked sample ticket that demonstrates the expected phrasing and level of detail.
- `references/fast-mode-intake.md` keeps `fast` mode from turning into a full PRD interview.
- `references/slice-design-checklist.md` defines what counts as a strong vertical slice and how to handle dependencies.
- `references/ticket-writing-checklist.md` keeps ticket tone, scenario phrasing, and note density consistent.

## File Structure

The skill keeps all guidance inside the skill directory so it packages cleanly:

- `SKILL.md` handles triggering, mode selection, and the high-level process.
- `references/` holds the durable guidance for intake, slice design, writing rules, and the Jira HTML template.
- `evals/` contains realistic prompts and expectations for regression checks.

## Author

Daniel Hohner
