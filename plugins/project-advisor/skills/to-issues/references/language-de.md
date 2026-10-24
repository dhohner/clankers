# German ticket language

## Sentences and terminology

Write natural German from the source ledger's meaning, using the register of a German engineering or product team.
Use concrete actors, actions, and results.

- `Als Nutzer möchte ich meine gespeicherten Ansichten verwalten.`
- `Dann erhalte ich eine Exportdatei, die nur die gefilterten Einträge enthält.`

Preserve product, protocol, integration, and interface names as used by the team, interface, provider documentation, or repository.
Use the team's spoken term when the source establishes it, including English names such as `Redirect URL`, `Access Token`, `Rate Limits`, and `Feature Flag`.
Use German for ordinary domain vocabulary and everyday actions, such as `Bestellung`, `Rechnung`, `Freigabe`, `speichern`, and `auswählen`.

Keep English names intact with German articles and normal German compound spelling: `die Redirect URL`, `das Access Token`, `Rate-Limit-Budget`, `Consent-Screen-Text`.
Reuse the same name and spelling across the ticket set.
Preserve quoted interface text verbatim.

## Scenarios and labels

Copy headers, labels, and Gherkin keywords from the selected German template.
Use `Angenommen`, `Wenn`, `Dann`, and optional `Und`.
When a person acts, use natural first-person phrasing such as `ich wähle`, `ich öffne`, or `ich erhalte`.
For system behavior, name the observing system or verification boundary.
Name predecessors by ticket title, such as `Blockiert durch: Rechnung aus der Bestelldetailansicht öffnen`.

Describe observable outcomes rather than a sequence of internal implementation tasks.
Keep binding technical names and constraints explicit; omit unnecessary internal code identifiers from scenarios.

- Outcome: `Kunden können die korrekte Rechnung aus der Bestelldetailansicht öffnen.`
- Relevant constraint: `Die Rechnungs-PDFs liegen beim externen Abrechnungsdienst; sein Ausfall muss den Bestellverlauf lesbar lassen.`

Replace filler such as `nahtlos`, `robust`, `erfolgreich`, and `es wird sichergestellt, dass` with the observable fact.
