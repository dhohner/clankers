# Ticket Writing Checklist

Read this before drafting the first ticket and again before finalizing the set.

The tickets should feel like they were written by a strong human teammate for another strong human teammate.

## Rewrite test

If a title, scenario, or note reads like a build checklist for an autonomous agent, rewrite it until it reads like a concise specification for a senior developer.

## Phrasing examples

- Vermeiden: `Einen Rechnungs-Endpoint anlegen und mit der Bestelldetailseite verdrahten.`
- Bevorzugen: `Kunden können die korrekte Rechnung aus der Bestelldetailansicht öffnen.`
- Vermeiden: `Eine Delegierungstabelle anlegen und die Genehmigungszuweisungs-API erweitern.`
- Bevorzugen: `Neue Genehmigungsanfragen werden während des aktiven Delegierungszeitraums an die Vertretung geleitet und danach automatisch zurückgegeben.`
- Vermeiden: `Der Workflow-Engine-Fall in Listen- und Detailansicht zeigt den aktuellen Owner an.`
- Bevorzugen: `Antragsteller sehen in ihren offenen Anfragen, wer aktuell entscheiden kann.`
- Vermeiden (Szenario): `Angenommen der TimingNormalizationService wird mit dem Kontext GEHEIMFRAGE aufgerufen / Wenn performDummyHash(GEHEIMFRAGE) ausgeführt wird`
- Bevorzugen (Szenario): `Angenommen das System verarbeitet eine Geheimfrage-Verifikation / Wenn die Timing-Normalisierung durchgeführt wird / Dann ist das Zeitverhalten von außen nicht von einer echten Verifikation unterscheidbar`

## Writing style

**Vary shape and length.** A straightforward slice might need two short scenarios and one note. A complex one might need four scenarios and several notes. Let the content dictate the shape.

**Keep note structure aligned with the template.** Follow `references/jira-issue-template.md` for the exact HTML shape of the Hinweise section. In that structure, omit note entries that carry no information instead of filling them with placeholders.

**Cut filler.** Words like `nahtlos`, `robust`, `umfassend`, `zuverlässig`, `klar und verständlich`, `eindeutig`, and `sichergestellt` are usually padding. Replace them with concrete, observable outcomes.

**Be concrete in scenarios.** Name the screen, action, or visible result. First-person phrasing such as `ich befinde mich`, `ich klicke`, and `ich sehe` is preferred over third-person phrasing.

**Keep every scenario line anchored to a participant.** Avoid generic formulations such as `eine Anfrage wird zugewiesen`, `der Genehmiger erhält`, or `es wird angezeigt`, when the same behavior can be written as `ich sehe`, `ich erhalte`, or `ich öffne` from the actor's point of view.

**Keep scenarios tight.** Three lines (`Angenommen`, `Wenn`, `Dann`) is often enough. Add `Und` only when it introduces distinct, testable information.

**Notes should earn their place.** `Was umgesetzt werden soll` should stay compact. When the template includes `Blockiert durch`, it should name an actual predecessor slice. `Technische Hinweise` should only contain non-obvious constraints or context that a senior developer would not infer from the scenarios alone.

**Translate implementation surfaces before writing.** If the source mentions services, engines, APIs, tables, React components, list/detail views, or similar architecture terms, convert them into user-visible behavior or domain constraints. Keep those raw terms out of titles, user stories, scenarios, and `Was umgesetzt werden soll` unless the term is actually part of the user-facing product language.

**Translate stray English business jargon too.** Even when a phrase is not an implementation surface, rewrite common mixed-language terms such as `Business Unit`, `Owner`, `Reviewer`, or `In-Product-Benachrichtigung` into natural German unless the English term is the established product term.

**Do not fabricate product detail.** If the source does not mention a validation rule, quota, permission exception, duplicate-handling rule, or special error path, do not introduce it as if it were settled product intent. Either omit it, ask about it when it changes the slice shape, or place it under `Annahmen` or `Offene Fragen` when it genuinely needs to be surfaced.

## Final pass

Before saving each ticket, remove:

- layer-by-layer implementation steps
- internal code identifiers in scenarios
- architecture nouns copied from the source when a domain or user-visible phrasing would say the same thing
- empty note sections or placeholder values such as `Keine`
- generic adjectives that do not change the meaning
- invented product rules that are not supported by the source or repo context
