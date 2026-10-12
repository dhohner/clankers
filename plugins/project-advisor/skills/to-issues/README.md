# PRD to issues

Break a Product Requirements Document into work items for Jira that developers can implement independently.
Each item covers a thin vertical slice, following the tracer bullet approach.

The items describe desired behavior and verifiable outcomes for experienced developers.

## How it works

The skill accepts a PRD, accepted `to-prd` bundle, feature brief, or settled planning prose and writes Markdown files for Jira:

1. Reads the PRD from a workspace file or asks the user, preferring current `to-prd` `prd.yaml` manifests over the rendered `index.html` when both exist; use `brief` mode for planning prose or feature briefs that are not packaged as `to-prd` artifacts.
2. Checks repository terminology, workflow names, role names, interface labels, and constraints that need explanation when the source is ambiguous or explicitly refers to repository context.
3. Uses `blocks.requirements`, `blocks.testing_strategy`, and traceability links as the main PRD source, then breaks the PRD or feature brief into thin vertical slices that each cover a complete flow and can be demonstrated on their own.
4. Runs a full approval loop in `default` mode and a minimal clarification loop in `brief` mode.
5. Writes one file per slice into `action-items/jira-issues/`.

## Modes

Two independent arguments select how the skill runs, in any order.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| Source mode | `default`, `brief` | `default` | `default` reads a full PRD or accepted `to-prd` bundle and runs the breakdown approval loop; `brief` reads planning prose or a feature brief and asks only about decisions that change the slices |
| Ticket language | `de`, `en` | `de` | Sets the language of the tickets, including the panel headers, Gherkin keywords, and note labels |

The PRD, brief, and repository language never select the ticket language.
An English PRD becomes German tickets by default, and a German brief becomes English tickets when `en` is selected.

## Output format

Each generated file uses HTML panels compatible with Jira:

- User story header: colored `Als / möchte ich / damit` or `As / I want / so that` format
- Acceptance criteria (`jePanel_info`): one scenario panel per criterion, phrased as observable behavior
- Scenario panels (`jePanel_dashed`): Gherkin syntax with colored keywords: `Angenommen`, `Wenn`, `Dann`, `Und` in German and `Given`, `When`, `Then`, `And` in English
- Notes panel (`jePanel_idea`): concise implementation context, assumptions, dependencies, risks, and open questions without turning the item into an execution script

## Usage

```text
"Convert the PRD into Jira issues"
"Break this PRD down into work items"
"Create implementation tickets from the PRD"
"Split the accepted prd.yaml from the to-prd bundle into Jira-ready slices"
"Break this PRD into Jira issues in English"
```

## Terminology

Write tickets in the selected ticket language, using natural phrasing for a product team that speaks it.
Treat terms as names and keep each one in the language the team uses in conversation.

In German tickets, `Redirect URL` and `Feature Flag` stay English while `Bestellung` and `Freigabe` stay German.
A coined compound such as `Weiterleitungs-URL` would send a developer hunting for a field that matches no label, no documentation, and no config key.

In English tickets, the same rule runs in both directions.
Keep the spelling of names already on screen; substituting a synonym such as `View Presets` would obscure the name.
A term the team keeps in German, such as `Freigabe`, stays German inside the English sentence.

`references/language-de.md` and `references/language-en.md` define the full rule for their language.

## Bundled references

- `references/jira-issue-template.md` contains the shared formatting rules.
- `references/jira-template-de.md` and `references/jira-template-en.md` contain each language's authoritative HTML template for Jira.
- `references/language-de.md` and `references/language-en.md` define register, wording, fixed labels, and the review gate for each language.
- `references/example-ticket-de.md` and `references/example-ticket-en.md` contain fully worked sample tickets that demonstrate the expected phrasing and level of detail.
- `references/default-source-intake.md` contains source precedence, PRD extraction, HTML fallback, and rules for taking shortcuts in default mode.
- `references/brief-mode-intake.md` keeps `brief` mode from turning into a full PRD interview.
- `references/slice-design-checklist.md` defines what counts as a strong vertical slice and how to handle dependencies.
- `references/ticket-writing-checklist.md` keeps ticket content, scenario phrasing, and note density consistent across both languages.

## File structure

All guidance lives inside the skill directory:

- `SKILL.md` handles triggering, mode and language selection, phase gates, and the overall process.
- `references/` holds guidance for intake, slice design, writing rules, wording for each language, and the Jira HTML template.
- `evals/` contains realistic prompts and expectations for regression checks in both languages.

## Author

Daniel Hohner
