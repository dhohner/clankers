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
- Vermeiden (Szenario): `Angenommen der TimingNormalizationService wird mit dem Kontext GEHEIMFRAGE aufgerufen / Wenn performDummyHash(GEHEIMFRAGE) ausgeführt wird`
- Bevorzugen (Szenario): `Angenommen das System verarbeitet eine Geheimfrage-Verifikation / Wenn die Timing-Normalisierung durchgeführt wird / Dann ist das Zeitverhalten von außen nicht von einer echten Verifikation unterscheidbar`

## Writing style

**Vary shape and length.** A straightforward slice might need two short scenarios and one note. A complex one might need four scenarios and several notes. Let the content dictate the shape.

**Skip empty sections.** If a slice has no open questions, omit `Offene Fragen` entirely. Do the same for `Risiken`, `Annahmen`, `Abhängigkeiten`, `Blockiert durch`, and other note entries that carry no information. If the slice can start immediately, omit `Blockiert durch` instead of writing `Keine`.

**Cut filler.** Words like `nahtlos`, `robust`, `umfassend`, `zuverlässig`, `klar und verständlich`, `eindeutig`, and `sichergestellt` are usually padding. Replace them with concrete, observable outcomes.

**Be concrete in scenarios.** Name the screen, action, or visible result. First-person phrasing such as `ich befinde mich`, `ich klicke`, and `ich sehe` is preferred over third-person phrasing.

**Keep scenarios tight.** Three lines (`Angenommen`, `Wenn`, `Dann`) is often enough. Add `Und` only when it introduces distinct, testable information.

**Notes should earn their place.** `Was umgesetzt werden soll` should stay compact. `Blockiert durch` should name an actual predecessor slice only when one exists. `Technische Hinweise` should only contain non-obvious constraints or context that a senior developer would not infer from the scenarios alone.

**Do not fabricate product detail.** If the source does not mention a validation rule, quota, permission exception, duplicate-handling rule, or special error path, do not introduce it as if it were settled product intent. Either omit it, ask about it when it changes the slice shape, or place it under `Annahmen` or `Offene Fragen` when it genuinely needs to be surfaced.

## Final pass

Before saving each ticket, remove:

- layer-by-layer implementation steps
- internal code identifiers in scenarios
- empty note sections or placeholder values such as `Keine`
- generic adjectives that do not change the meaning
- invented product rules that are not supported by the source or repo context