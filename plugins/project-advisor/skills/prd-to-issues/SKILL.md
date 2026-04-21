---
name: prd-to-issues
description: Break a PRD into independently-grabbable Jira-ready work items using tracer-bullet vertical slices. Use this skill whenever the user wants to convert a PRD to issues, break a PRD into work items, create Jira tickets, or even asks for implementation tickets from a PRD. The output should still describe desired behavior, outcomes, and constraints for experienced developers rather than prescribing layer-by-layer implementation steps.
---

# PRD to Issues

Break a PRD into independently-grabbable Jira-ready work items using vertical slices (tracer bullets).

Write the resulting action items for experienced human developers. Describe desired product behavior, observable outcomes, constraints, and relevant context. Do not write them as step-by-step instructions for an autonomous coding agent.

## Process

### 1. Locate the PRD

Ask the user for the PRD source if it is not already in context. Prefer a markdown file in the workspace. If needed, ask for the relevant file path or for the PRD text to be pasted.

If the PRD is already available in the workspace, read it directly.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code.

### 3. Draft vertical slices

Break the PRD into **tracer bullet** issues. Each issue is a thin vertical slice that cuts through ALL integration layers end-to-end, NOT a horizontal slice of one layer.

Slices may be 'HITL' or 'AFK'. HITL slices require human interaction, such as an architectural decision or a design review. AFK slices can be implemented and merged without human interaction. Prefer AFK over HITL where possible.

<vertical-slice-rules>
- Each slice delivers a narrow but COMPLETE path through every layer (schema, API, UI, tests)
- A completed slice is demoable or verifiable on its own
- Prefer many thin slices over few thick ones
</vertical-slice-rules>

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each slice, show:

- **Title**: short descriptive name
- **Type**: HITL / AFK
- **Blocked by**: which other slices (if any) must complete first
- **User stories covered**: which user stories from the PRD this addresses

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the dependency relationships correct?
- Should any slices be merged or split further?
- Are the correct slices marked as HITL and AFK?

Iterate until the user approves the breakdown.

If the user explicitly says the breakdown is already approved, or the prompt says to assume approval, skip this review loop and move directly to file creation.

### 5. Create Jira-ready markdown files

For each approved slice, create a markdown file that the user can copy into Jira.

Each file must describe the slice in terms of expected behavior and business or product outcome. Assume the reader is an experienced developer who can determine the implementation details. Avoid decomposing the work into prescriptive layer-by-layer instructions or agent-style execution steps.

If the PRD contains suggested solution details such as APIs, tables, schemas, services, UI components, jobs, or other implementation ideas, treat them as context rather than as instructions to copy into the action item. Only keep such details when they are necessary constraints or dependencies.

Before drafting the first issue, read both bundled references:

- [references/jira-issue-template.md](references/jira-issue-template.md) for the exact Jira-compatible raw HTML structure and template rules.
- [references/example-ticket.md](references/example-ticket.md) for a fully worked example of the expected tone, scenario framing, and note density.

The markdown file should use Jira-compatible raw HTML blocks and must follow the exact structure from [references/jira-issue-template.md](references/jira-issue-template.md) unless the user explicitly asks for a different format.

Unless the user requests another location, create the files in a `action-items/jira-issues/` directory in the workspace.

Create files in dependency order (blockers first) so the later files can reference earlier slice titles or filenames in the "Blocked by" field.

Use a predictable filename pattern such as `01-short-slice-title.md`, `02-next-slice-title.md`, and so on.

If the PRD does not already provide the user story in `Als ... moechte ich ... damit ...` form, derive it from the slice intent.

Acceptance criteria must be expressed as named scenarios inside dashed panels, not as a plain checklist.
Acceptance criteria should describe externally verifiable behavior, outcomes, and constraints rather than internal implementation steps.
Scenarios must not reference internal code artifacts — no class names, service names, method signatures, enum constants, configuration keys, or database table/column names. When the PRD names such identifiers, translate them into observable behavior or domain-level language before writing the scenario.

Use this rewrite test before finalizing a slice: if a scenario, note, or title reads like a build checklist for an autonomous agent, rewrite it until it reads like a concise specification for a senior developer.

<phrasing-examples>
- Vermeiden: `Einen Rechnungs-Endpoint anlegen und mit der Bestelldetailseite verdrahten.`
- Bevorzugen: `Kunden können die korrekte Rechnung aus der Bestelldetailansicht öffnen.`
- Vermeiden: `Eine Delegierungstabelle anlegen und die Genehmigungszuweisungs-API erweitern.`
- Bevorzugen: `Neue Genehmigungsanfragen werden während des aktiven Delegierungszeitraums an die Vertretung geleitet und danach automatisch zurückgegeben.`
- Vermeiden (Szenario): `Angenommen der TimingNormalizationService wird mit dem Kontext GEHEIMFRAGE aufgerufen / Wenn performDummyHash(GEHEIMFRAGE) ausgeführt wird`
- Bevorzugen (Szenario): `Angenommen das System verarbeitet eine Geheimfrage-Verifikation / Wenn die Timing-Normalisierung durchgeführt wird / Dann ist das Zeitverhalten von außen nicht von einer echten Verifikation unterscheidbar`
</phrasing-examples>

<human-writing-style>
The tickets will sit alongside tickets written by human colleagues. They must be indistinguishable in tone and density.

**Vary shape and length.** A straightforward slice might need two short scenarios and one note. A complex one might need four scenarios and several notes. Let the content dictate the shape — do not pad simple slices or compress complex ones for uniformity.

**Skip empty sections.** If a slice has no open questions, omit "Offene Fragen" entirely — do not write "Keine". Same for Risiken, Annahmen, Abhängigkeiten, and any other note entry that carries no information.

**Cut filler.** Words like _nahtlos_, _robust_, _umfassend_, _zuverlässig_, _klar und verständlich_, _eindeutig_, _sichergestellt_ are padding. If a scenario says "Dann wird die Fehlermeldung klar und verständlich angezeigt", either drop the adjectives or replace them with something concrete and observable: "Dann nennt die Fehlermeldung den Grund und eine mögliche nächste Aktion".

**Be concrete in scenarios.** Name the screen, the button, the visible result. "Ich befinde mich auf der Personenübersicht und habe Filter gesetzt" beats "der Nutzer befindet sich in einer gefilterten Listenansicht". First-person perspective ("ich klicke", "ich sehe") is natural for German Gherkin and preferred over third person.

**Keep scenarios tight.** Three lines (Angenommen / Wenn / Dann) is often enough. Add "Und" only when it carries distinct, testable information — not to restate what "Dann" already implies.

**Notes should earn their place.** "Was umgesetzt werden soll" should be one or two sentences, not a paragraph. "Technische Hinweise" should only contain information that an experienced developer would not already expect from the slice description and scenarios alone. Tech stack details ("React-Frontend mit BFF-Schicht"), standard authorization rules ("nur eigene Daten sichtbar"), and other things any senior developer would assume are not worth mentioning. Non-obvious constraints — like timezone boundary behavior, unusual integration seams, compliance requirements that go beyond the obvious, or legacy quirks — belong here. If a slice has nothing non-obvious to say, omit Technische Hinweise entirely. One useful note is better than six boilerplate entries.
</human-writing-style>

Do not create or modify GitHub issues as part of this skill.

The output of this skill is the set of markdown files, not the Jira tickets themselves.

### Language: German throughout

All generated ticket content must be written in German. This applies to titles, user stories, scenario names, scenario body text, note labels, and note content. The only exceptions are proper nouns, technical terms with no established German equivalent (e.g. "Endpoint", "API"), and code identifiers. The Gherkin keywords (`Angenommen`, `Wenn`, `Dann`, `Und`) and the user story frame (`Als`, `möchte ich`, `damit`) are already German in the template — the rest of the ticket must match.
