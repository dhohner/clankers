# English ticket language

## Sentences and terminology

Write plain English from the source ledger's meaning, using the register of an engineering or product team.
Use concrete actors, actions, and results, regardless of the source language.
Prefer active voice when the actor matters and is known.

- `As a user I want to manage my saved views.`
- `Then I get an export file that contains only the filtered entries.`

Preserve product, protocol, integration, and interface names as used by the team, interface, provider documentation, or repository.
If a surface is named `Saved Views`, keep that name rather than inventing `View Presets`.
Keep names the team uses in another language, such as `Freigabe` or `Sachbearbeiter`, when the source establishes that usage.
Translate ordinary domain vocabulary and everyday actions: `order`, `invoice`, `deadline`, `open`, `save`, and `select`.
A German word in the source alone does not establish a team name.

Reuse each concept's name, spelling, and capitalization across the ticket set.
Distinguish named labels from ordinary nouns: `the Saved Views panel`, `a saved view`, `the Redirect URL`, `the invoice`.
Follow the product or repository spelling convention; default to US spelling when neither establishes one.
Preserve quoted interface text verbatim.

## Scenarios and labels

Copy headers, labels, and Gherkin keywords from the selected English template.
Use `Given`, `When`, `Then`, and optional `And`.
Write scenario results in the present indicative: `Then I see the invoice for that order`.
When a person acts, use natural first-person phrasing such as `I select`, `I open`, or `I get`.
For system behavior, name the observing system or verification boundary.
Name predecessors by ticket title, such as `Blocked by: Open an invoice from the order detail view`.

Describe observable outcomes rather than a sequence of internal implementation tasks.
Keep binding technical names and constraints explicit; omit unnecessary internal code identifiers from scenarios.

- Outcome: `Customers open the correct invoice from the order detail view.`
- Relevant constraint: `Invoice PDFs live with the external billing provider, and an outage there still has to leave the order history readable.`

Replace filler such as `seamless`, `robust`, `successfully`, `be able to`, and `ensure that` with the observable fact.
