# Ticket Writing Checklist

Write a concise product specification for a senior engineer, not a build sequence.

## Outcome language

Use German labels and German sentence framing while retaining established source-backed English product, UI, and technical terms when they are clearer.
Make the title and user story name the product outcome.
State why the behavior matters to a user, operator, business outcome, compliance posture, or delivery risk.
Describe observable behavior, data outcomes, constraints, and acceptance boundaries.
Translate source references to APIs, tables, services, engines, components, methods, files, and test suites into domain behavior unless the term itself is user-facing or a binding source constraint.
Keep each ticket understandable without access to the PRD, brief, source file, or unavailable source section.

## Source fidelity

Use only behavior and rules that are explicit or directly implied by the source ledger.
Place material uncertainty under `Annahmen` or `Offene Fragen` when it can remain unresolved without destabilizing the slice.
Preserve source-backed validations, quotas, permissions, recovery behavior, integration constraints, and non-goals in the slices they govern.
Use bounded repository evidence only to clarify terminology, product surfaces, system boundaries, or constraints already grounded in the source.

## Acceptance scenarios

Write named scenarios in German Gherkin with `Angenommen`, `Wenn`, `Dann`, and only useful `Und` lines.
Anchor user-facing scenario steps to the participant with natural first-person phrasing such as `ich befinde mich`, `ich wähle`, `ich öffne`, `ich sehe`, and `ich erhalte`.
For system-verifiable behavior, name the external observer or system boundary that can verify the result.
Name concrete screens, actions, system responses, data outcomes, and important boundaries.
Three lines are sufficient for a straightforward scenario; add lines only for distinct testable information.
Use observable facts in place of filler such as `nahtlos`, `robust`, `umfassend`, `zuverlässig`, `eindeutig`, `klar und verständlich`, and `sichergestellt`.
Express internal identifiers such as class names, method signatures, enum constants, and database artifacts in domain language or externally observable behavior.

## Notes

Always include `Was umgesetzt werden soll` as a compact, self-contained description of the vertical outcome and its important boundaries.
Include `Blockiert durch` only for a genuine predecessor slice.
Use `Technische Hinweise` only for non-obvious source-backed constraints or context that materially helps an experienced developer.
Use `Annahmen`, `Abhängigkeiten`, `Risiken`, and `Offene Fragen` only when they carry decision-relevant information.
Omit empty note entries instead of adding placeholders such as `Keine`.
Keep implementation choices with engineering unless the source establishes a product, compliance, architecture, or integration constraint.

## Rewrite test

Rewrite any title, scenario, or note that reads like a layer-by-layer task list.

- Build sequence: `Einen Rechnungs-Endpoint anlegen und mit der Bestelldetailseite verdrahten.`
- Product outcome: `Kunden können die korrekte Rechnung aus der Bestelldetailansicht öffnen.`
- Internal scenario: `Wenn performDummyHash(GEHEIMFRAGE) ausgeführt wird.`
- Observable scenario: `Wenn die Timing-Normalisierung für eine Geheimfrage durchgeführt wird.`

Consult `example-ticket.md` when a fuller comparison is needed.

## Final gate

Check every complete ticket against every line below and fix each failure:

- The file follows every structural rule in `jira-issue-template.md`, including panel order, classes, styles, one dashed panel per named scenario, and a notes list outside the closed notes panel.
- The title, user story, scenario names, scenario text, and notes use German framing with only established source-backed English terms retained.
- The title, capability, and benefit express an outcome rather than an implementation surface.
- The scenarios collectively prove the slice's happy path and every important source-backed boundary assigned to it.
- Scenario steps use participant-centered phrasing where natural, concrete outcomes, and no filler language or internal code identifiers.
- Every product rule is source-backed, directly implied, or explicitly framed as an assumption or open question.
- The ticket is self-contained and contains no reference to an unavailable PRD, brief, planning artifact, or source section.
- Cross-ticket references identify only genuine prerequisites or delivery dependencies.
- `Was umgesetzt werden soll` is present; every other note entry earns its place and contains real information.
- `Technische Hinweise` are brief, non-obvious, decision-relevant, and free of standard stack or routine implementation guidance.
- The ticket contains no layer-by-layer implementation plan or autonomous-agent instructions.
- The filename is predictable and its sequence number respects real dependencies.

**Complete when:** every ticket has been evaluated against every gate item and no known violation remains.
