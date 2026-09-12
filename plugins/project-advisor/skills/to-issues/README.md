# PRD to Issues

Break a Product Requirements Document into independently implementable Jira-ready work items using tracer-bullet vertical slices.

The generated items are written for experienced developers. They describe desired behavior and verifiable outcomes rather than agent-style step sequences or layer-by-layer implementation checklists.

## What It Does

This skill converts a PRD, accepted `to-prd` bundle, feature brief, or settled planning prose into a set of Jira-ready markdown files:

1. **Locate the PRD** - reads the PRD from a workspace file or asks the user, preferring current `to-prd` `prd.yaml` manifests over the rendered `index.html` when both exist; use `brief` mode for planning prose or feature briefs that are not packaged as `to-prd` artifacts
2. **Inspect context only when needed** - checks repository terminology, workflow names, role names, user-facing labels, and non-obvious constraints only when the source is ambiguous or explicitly points to repo context
3. **Draft vertical slices** - uses `blocks.requirements`, `blocks.testing_strategy`, and traceability links as the main PRD source, then breaks the PRD or feature brief into thin end-to-end tracer-bullet slices, each demoable on its own
4. **Review only what matters** - runs a full approval loop in `default` mode and a minimal clarification loop in `brief` mode
5. **Create Jira-ready markdown files** - writes one file per slice into `action-items/jira-issues/`

## Modes

Two independent arguments select how the skill runs, in any order.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| Source mode | `default`, `brief` | `default` | `default` reads a full PRD or accepted `to-prd` bundle and runs the breakdown approval loop; `brief` reads planning prose or a feature brief and asks only about decisions that change the slices |
| Ticket language | `de`, `en` | `de` | Sets the language of the tickets, including the panel headers, Gherkin keywords, and note labels |

The PRD, brief, and repository language never select the ticket language.
An English PRD becomes German tickets by default, and a German brief becomes English tickets when `en` is selected.
Tickets are written for the team that reads them.

## Output Format

Each generated file uses Jira-compatible HTML panels:

- **User story header** - colored `Als / möchte ich / damit` or `As / I want / so that` format
- **Acceptance criteria** (`jePanel_info`) - one scenario panel per criterion, phrased as observable behavior
- **Scenario panels** (`jePanel_dashed`) - Gherkin syntax with colored keywords: `Angenommen`, `Wenn`, `Dann`, `Und` in German and `Given`, `When`, `Then`, `And` in English
- **Notes panel** (`jePanel_idea`) - concise implementation context, assumptions, dependencies, risks, and open questions without turning the item into an execution script

## Usage

```text
"Convert the PRD into Jira issues"
"Break this PRD down into work items"
"Create implementation tickets from the PRD"
"Split the accepted prd.yaml from the to-prd bundle into Jira-ready slices"
"Break this PRD into Jira issues in English"
```

## Terminology

Generated tickets are composed in the ticket language, in the register of a product team that speaks it, rather than translated word for word.

Terms are treated as names, and each one keeps whichever language the team says out loud.

In German tickets, `Redirect URL` and `Feature Flag` stay English while `Bestellung` and `Freigabe` stay German.
A coined compound such as `Weiterleitungs-URL` would send a developer hunting for a field that matches no label, no documentation, and no config key.

In English tickets, the same rule runs in both directions.
A name already on the screen keeps its spelling rather than becoming a synonym such as `View Presets`.
A term the team keeps in German, such as `Freigabe`, stays German inside the English sentence.

`references/language-de.md` and `references/language-en.md` own the full rule for their language.

## Bundled References

- `references/jira-issue-template.md` contains the authoritative Jira-compatible HTML template for both languages and the shared formatting rules.
- `references/language-de.md` and `references/language-en.md` own register, wording, fixed labels, and the per-language gate.
- `references/example-ticket-de.md` and `references/example-ticket-en.md` contain fully worked sample tickets that demonstrate the expected phrasing and level of detail.
- `references/default-source-intake.md` contains source precedence, PRD extraction, HTML fallback, and short-path rules for default mode.
- `references/brief-mode-intake.md` keeps `brief` mode from turning into a full PRD interview.
- `references/slice-design-checklist.md` defines what counts as a strong vertical slice and how to handle dependencies.
- `references/ticket-writing-checklist.md` keeps ticket content, scenario phrasing, and note density consistent across both languages.

## File Structure

The skill keeps all guidance inside the skill directory so it packages cleanly:

- `SKILL.md` handles triggering, mode and language selection, phase gates, and the high-level process.
- `references/` holds the durable guidance for intake, slice design, writing rules, per-language wording, and the Jira HTML template.
- `evals/` contains realistic prompts and expectations for regression checks in both languages.

## Author

Daniel Hohner
