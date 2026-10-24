# To issues

Turn PRDs, feature briefs, and technical requirements into independently verifiable Jira work items for experienced engineers.
Product tickets cover thin vertical slices.
Infrastructure tickets establish usable platform capabilities and prerequisite contracts.

The items describe desired behavior and verifiable outcomes for experienced developers.
Tickets with dependencies summarize the contracts they inherit and test behavior they add or could invalidate.
Both profiles follow the same flow: an opening, named acceptance scenarios, and a compact notes list.
Scenarios group cases by rule or state transition and specify each case's conditions and expected result.
Infrastructure notes include shared verification methods and expected evidence.

Different values, permission paths, and interface languages can share a scenario.
The skill sets no fixed scenario count.
Usability goals and other success measures provide validation context unless the source explicitly makes them acceptance or release conditions.

## How it works

The skill accepts a PRD, an accepted `to-prd` bundle, a feature brief, technical requirements, or settled planning prose.
Use `brief` mode for planning prose or feature briefs that are not packaged as `to-prd` artifacts.

1. Reads the PRD from a workspace file or asks the user for it.
   When both exist, it prefers current `to-prd` `prd.yaml` manifests over the rendered `index.html`.
2. Checks repository terminology, workflow names, role names, interface labels, and constraints that need explanation when the source is ambiguous or explicitly refers to repository context.
3. Uses `blocks.requirements`, `blocks.testing_strategy`, and traceability links as the main PRD source.
   It groups requirements into verifiable outcomes using the selected ticket profile.
4. Runs a full approval loop in `default` mode and asks only for necessary clarification in `brief` mode.
5. Writes one Markdown file per slice into `action-items/jira-issues/`.

## Modes

You can supply mode, language, and profile independently and in any order.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| Source mode | `default`, `brief` | `default` | `default` reads a full PRD or accepted `to-prd` bundle and runs the breakdown approval loop; `brief` reads planning prose or a feature brief and asks only about decisions that change the slices |
| Ticket language | `de`, `en` | `de` | Sets the language of the tickets, including headers, verification labels, Gherkin keywords, and note labels |
| Ticket profile | `product`, `infrastructure` | Inferred from the outcome | Selects content and acceptance structure; an explicit profile applies to the set, while mixed sources can use a profile per slice |

The PRD, brief, and repository language never select the ticket language.
An English PRD becomes German tickets by default, and a German brief becomes English tickets when `en` is selected.

## Output format

Both profiles use HTML compatible with Jira.
Profile selection does not set the Jira issue type.

### Product

Product tickets use:

- User story header: colored `Als / möchte ich / damit` or `As / I want / so that` format
- Acceptance criteria (`jePanel_info`): header followed by named scenarios that group related cases by product rule
- Scenario panels (`jePanel_dashed`): Gherkin syntax with colored keywords: `Angenommen`, `Wenn`, `Dann`, `Und` in German and `Given`, `When`, `Then`, `And` in English
- Notes panel (`jePanel_idea`): concise implementation context, assumptions, dependencies, risks, and open questions without turning the item into an execution script

### Infrastructure

Infrastructure tickets reuse the product profile's opening, acceptance scenarios, and notes flow:

1. A short outcome paragraph naming the capability, consumer or operator, and purpose.
2. Acceptance criteria in the default information panel, followed by dashed scenario panels with navy headings and colored Given, When, Then, and optional And steps in the selected language.
3. Notes in the default notes header panel, followed by one list with bold entry labels.

The opening uses the product template's orange consumer, green capability, and blue purpose or scope colors.

Scope and Verification and evidence are required note entries.
Required constraints, Blocked by, Dependencies, Operations, Assumptions, Risks, and Open decisions appear when relevant.
Group shared execution steps, static checks, and expected evidence under Verification and evidence, with a clear mapping to scenarios or cases.
Use native Jira headings, paragraphs, lists, and bold text so the description stays readable without custom styling.
Keep long acceptance prose in one column and group equivalent cases while preserving each case's conditions and result.
Technical constraints such as Terraform, identity federation, authorization scopes, and state handling remain explicit when required by the source.
Prerequisites can be separate tickets when they deliver a usable contract with independent verification and a named consumer.
Missing decisions about scope, security, state, ownership, or approval policy are resolved before drafting when they affect ticket boundaries.

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
A coined compound such as `Weiterleitungs-URL` would make a developer search for a field name absent from labels, documentation, and config keys.

In English tickets, keep names in whichever language the team uses.
Keep the spelling of names already on screen; a synonym such as `View Presets` would obscure the name.
A term the team keeps in German, such as `Freigabe`, stays German inside the English sentence.

`references/language-de.md` and `references/language-en.md` define the full rule for their language.

Use `references/ticket-prose.md` when drafting and reviewing tickets in either language.
It explains how to remove rhetorical padding, repetition, inflated claims, and decorative formatting while preserving source requirements, established names, and the Jira template.

## Bundled references

- `references/jira-issue-template.md` contains the shared formatting rules.
- `references/jira-template-de.md` and `references/jira-template-en.md` contain the product HTML templates.
- `references/jira-infrastructure-template-de.md` and `references/jira-infrastructure-template-en.md` contain the infrastructure HTML templates.
- `references/infrastructure-tickets.md` defines technical slicing, decision boundaries, operational content, and verification evidence.
- `references/language-de.md` and `references/language-en.md` define register, wording, fixed labels, and the review gate for each language.
- `references/example-ticket-de.md` and `references/example-ticket-en.md` contain product sample tickets.
- `references/example-infrastructure-de.md` and `references/example-infrastructure-en.md` contain Azure pipeline sample tickets in both languages.
- `references/default-source-intake.md` contains source precedence, PRD extraction, HTML fallback, and rules for taking shortcuts in default mode.
- `references/brief-mode-intake.md` keeps `brief` mode from turning into a full PRD interview.
- `references/slice-design-checklist.md` defines the criteria for a vertical slice and explains how to handle dependencies.
- `references/ticket-writing-checklist.md` keeps ticket content, scenario phrasing, and note density consistent across both languages.
- `references/ticket-prose.md` contains shared prose guidance and German and English examples.

## File structure

The skill directory contains:

- `SKILL.md` handles triggering, mode, language and profile selection, phase gates, and the overall process.
- `references/` holds guidance for intake, slice design, writing rules, wording for each language, and the Jira HTML template.

## Author

Daniel Hohner
