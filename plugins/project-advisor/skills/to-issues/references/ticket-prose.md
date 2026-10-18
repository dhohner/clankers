# Ticket prose

Use plain, neutral German or English customary for a product team in titles, user stories, scenarios, and notes.

## Wording

Name the actor, action, and observable result with concrete nouns and plain verbs.
State relationships precisely: who owns a record, what triggers an action, or which service supplies a document.
Use active voice when the actor matters and is known.

Remove rhetorical openings, invented objections, empty contrasts, repeated conclusions, inflated claims, sales language, and commentary about writing the ticket.
Keep sentences that add behavior, boundaries, reasons, or necessary context.
Rewrite awkward passages from their meaning instead of substituting flagged words.
Judge phrases in the selected language and context, including German patterns such as `nicht nur …, sondern auch` or `von entscheidender Bedeutung`.

For an export of filtered orders as CSV:

- Padded German: `Dabei geht es nicht nur um einen Export, sondern um einen entscheidenden Beitrag zur Transparenz.`
- Direct German: `Ich exportiere die gefilterten Bestellungen als CSV.`
- Padded English: `This is not just an export; it is a pivotal step toward greater transparency.`
- Direct English: `I export the filtered orders as CSV.`

## Fidelity and format

Preserve source facts, actors, quantities, units, thresholds, ordering, concurrency, permissions, recovery rules, and uncertainty.
Keep meaningful negatives such as denials and exclusions.
Keep assumptions distinct from requirements and leave missing decisions unresolved.
Preserve names under the selected language reference and quoted interface text verbatim.

Let the requirements determine sentence and list structure, including lists with three distinct requirements and repeated Gherkin openings.
Prefer periods, commas, colons, or parentheses to sentence dashes unless the user's writing sample calls for them.
Preserve punctuation in names, code, paths, URLs, and quoted interface text, and hyphens required by spelling.

Follow the Jira template's HTML, panels, labels, colors, lists, and Gherkin keywords.
Use sentence case with normal German noun capitalization and exact product name spelling.
Omit decorative formatting and chat wrappers.

After editing, compare the ticket with the source ledger for added or lost claims and check the required format.
Save only the final ticket text.
