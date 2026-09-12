# German Ticket Language

Load this reference when the ticket language is `de`.

Write in the register of a German-speaking product team, in German sentences carrying the vocabulary such a team says out loud.
Composing the sentence and choosing the terms inside it are separate decisions.
Collapsing them produces translated-sounding tickets, because the pull into German reaches the names too.

## Compose sentences, do not translate them

Compose each sentence in German from the source ledger's meaning, phrased the way a German product owner would say it in refinement, even when the source is English.
A sentence that mirrors English word order or idiom is translated rather than composed; rewrite it from its meaning.

- Translated: `Als Nutzer möchte ich in der Lage sein, meine gespeicherten Ansichten zu verwalten.`
- Composed: `Als Nutzer möchte ich meine gespeicherten Ansichten verwalten.`
- Translated: `Dann wird die Exportdatei erfolgreich heruntergeladen mit allen angewendeten Filtern.`
- Composed: `Dann erhalte ich eine Exportdatei, die nur die gefilterten Einträge enthält.`

## Terms are names

A product, protocol, integration, or interface term is a name.
The developer searches for it in the provider's documentation, in the codebase, and on the screen they are building.
`Redirect URL` matches the label, the documentation, and the config key at once.
`Weiterleitungs-URL` sends someone hunting for a field the OAuth configuration screen does not have.

Settle each term by the standup test.
Which word does the team say out loud?
Keep that answer in whichever language it comes.
Genuine domain vocabulary is German, such as `Bestellung`, `Rechnung`, `Freigabe`, `Vertretung`, and `Frist`.
So are everyday verbs and objects, such as `öffnen`, `speichern`, `auswählen`, and `Liste`.
A team says `Ich storniere die Bestellung` rather than `Ich cancele die Order`.
An English term the team keeps in English stays English even when the sentence around it is German.

A name breaks when a word inside it is replaced by a German one, not when German orthography is applied around it.
Standing on its own, the term keeps its English spelling and takes a German article, as in `die Redirect URL` and `das Access Token`.
Modifying a German noun, it takes the usual hyphens, as in `Rate-Limit-Budget` and `Consent-Screen-Text`.

- Translated: `Die Weiterleitungs-URL muss auf https lauten, bevor das Zugriffstoken ausgestellt wird.`
- Composed: `Die Redirect URL muss https verwenden, bevor wir das Access Token ausstellen.`
- Translated: `Nach einer Rücksetzung greift die Ratenbegrenzung erneut, und der Funktionsschalter bleibt aktiv.`
- Composed: `Nach einem Rollback greifen die Rate Limits erneut, und das Feature Flag bleibt aktiv.`
- Translated: `Der Trichter zeigt den Leerzustand, solange keine Ereignisse erfasst wurden.`
- Composed: `Der Funnel zeigt den Empty State, solange keine Events erfasst wurden.`

Name each concept once and reuse that exact name and spelling in every ticket.
`Delivery Log` here and `Zustellhistorie` there, or `Redirect URL` here and `Redirect-URL` there, read as two things a developer has to reconcile.

## Fixed wording

Use the German panel headers, Gherkin keywords, and note labels exactly as `jira-issue-template.md` spells them.

Scenario steps use `Angenommen`, `Wenn`, `Dann`, and optional `Und`.
Anchor user-facing steps to the participant with natural first-person phrasing such as `ich befinde mich`, `ich wähle`, `ich öffne`, `ich sehe`, and `ich erhalte`, rather than `der Nutzer` or `ein Kunde`.
Name a predecessor by its ticket title, as in `Blockiert durch: Rechnung aus der Bestelldetailansicht öffnen`.

Replace filler with an observable fact.
`nahtlos`, `robust`, `umfassend`, `zuverlässig`, `eindeutig`, `klar und verständlich`, `erfolgreich`, and `sichergestellt` describe nobody's acceptance test.

## Rewrite test

Rewrite any title, scenario, or note that reads like a layer-by-layer task list.

- Build sequence: `Einen Rechnungs-Endpoint anlegen und mit der Bestelldetailseite verdrahten.`
- Product outcome: `Kunden können die korrekte Rechnung aus der Bestelldetailansicht öffnen.`
- Internal scenario: `Wenn performDummyHash(GEHEIMFRAGE) ausgeführt wird.`
- Observable scenario: `Wenn die Timing-Normalisierung für eine Geheimfrage durchgeführt wird.`
- Redundant note: `Technische Hinweise: Die Zugriffsprüfung muss serverseitig beim Laden der Daten erfolgen, nicht erst in der Ansicht.`
- Decision-relevant note: `Technische Hinweise: Die Rechnungs-PDFs liegen beim externen Abrechnungsdienst; sein Ausfall muss den Bestellverlauf lesbar lassen.`

Consult `example-ticket-de.md` for a fuller comparison.

## Language gate

- Title, user story, scenario names, scenario text, and notes are composed German in the team register, and no sentence mirrors English word order or idiom.
- No sentence contains `in der Lage sein`, `es wird sichergestellt, dass`, or another construction that only exists because the source said it that way in English.
- Every term passes the standup test, and no word inside an English product, protocol, integration, or interface term was replaced by a German one.
- German articles and hyphenation sit around intact English names rather than inside them.
- Each concept carries the same name and the same spelling in every ticket.
- Scenario steps use first-person phrasing where a person acts, and name the observing system or boundary where no person does.
- No filler adjective and no internal code identifier appears in scenario text.
- Panel headers, Gherkin keywords, and note labels are the German ones from the template, with no English label such as `What to build` or `Open questions`.

**Complete when:** every ticket satisfies every item above.
