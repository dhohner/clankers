# Jira Issue Template

Use this file as the authoritative raw structure for every generated Jira-ready markdown issue unless the user explicitly asks for a different format.

The panel classes, inline styles, section order, and German Gherkin phrasing are intentional. Preserve them exactly unless the user asks for a different visual or textual convention.

```text
# <Slice title>

<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">
Als <span style="color:#ff8c00"><persona></span> m&ouml;chte ich <span style="color:#008000"><capability></span> damit <span style="color:#2980b9"><benefit></span>
</h2>

<div class="jePanel_info" style="border:1px solid #9eb6d4; padding:.5em 1em .5em 2.5em">
<p dir="auto"><b>Akzeptanzkriterien </b>(Muss die Anforderung zum Zeitpunkt der Abnahme erf&uuml;llen)</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Szenario 1: <scenario name></h2>
<p dir="auto"><span style="color:#2980b9"><b>Angenommen</b></span> ...</p>
<p dir="auto"><span style="color:#ff8c00"><b>Wenn</b></span> ...</p>
<p dir="auto"><span style="color:#27ae60"><b>Dann</b></span> ...</p>
<p dir="auto"><span style="color:#f39c12"><b>Und</b></span> ...</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Szenario 2: <scenario name></h2>
<p dir="auto"><span style="color:#2980b9"><b>Angenommen</b></span> ...</p>
<p dir="auto"><span style="color:#ff8c00"><b>Wenn</b></span> ...</p>
<p dir="auto"><span style="color:#16a085"><b>Dann</b></span> ...</p>
<p dir="auto"><span style="color:#27ae60"><b>Und</b></span> ...</p>
</div>

<div class="jePanel_idea" style="border:1px solid #d4d39e; padding:.5em 1em .5em 2.5em">
<p dir="auto"><b>Hinweise</b></p>
</div>

<ul>
<li><b>Was umgesetzt werden soll:</b> Kompakte Beschreibung dieses vertikalen Schnitts. Beschreibe das gew&uuml;nschte End-to-End-Verhalten, das erwartete Ergebnis und wichtige Randbedingungen. Verweise auf relevante Abschnitte des &uuml;bergeordneten PRD, statt Inhalte zu duplizieren. Kein schrittweiser Implementierungsplan.</li>
<li><b>Blockiert durch:</b> Keine &ndash; kann sofort begonnen werden</li>
<li><b>Technische Hinweise:</b> Optional. Nur essentiellen Kontext, Schnittstellen oder nicht-offensichtliche Randbedingungen festhalten, die einem erfahrenen Entwickler bei der Umsetzung helfen. Keine Aufgabenlisten oder Agent-Anweisungen.</li>
<li><b>Annahmen:</b>
<ul>
<li>...</li>
<li>...</li>
</ul>
</li>
<li><b>Abh&auml;ngigkeiten:</b>
<ul>
<li>...</li>
<li>...</li>
</ul>
</li>
<li><b>Risiken:</b>
<ul>
<li>...</li>
<li>...</li>
</ul>
</li>
<li><b>Offene Fragen:</b>
<ul>
<li>...</li>
<li>...</li>
</ul>
</li>
</ul>
```

## Template rules

- Preserve the exact panel classes: `jePanel_info`, `jePanel_dashed`, `jePanel_idea`.
- The `jePanel_info` panel contains ONLY the "Akzeptanzkriterien" header paragraph. The dashed scenario panels (`jePanel_dashed`) come AFTER the closing `</div>` of `jePanel_info`, not nested inside it.
- The `jePanel_idea` panel contains ONLY the "Hinweise" header paragraph. The note content follows AFTER the closing `</div>` of `jePanel_idea` as a `<ul>` bullet list with one `<li>` per entry, not nested inside the panel.
- When a note entry (e.g. Annahmen, Abhängigkeiten, Risiken, Offene Fragen) contains multiple points, render them as a nested `<ul>` sub-list inside the parent `<li>`. If only a single point exists, a nested list is still acceptable but inline text is also fine.
- Preserve the exact inline styles unless the user explicitly asks for a different visual format.
- The user story header must color the semantic parts: `#ff8c00` (orange) for the **Persona**, `#008000` (green) for the **Capability**, `#2980b9` (blue) for the **Benefit**. The connecting words `Als`, `m&ouml;chte ich`, `damit` remain uncolored.
- Every acceptance criterion must be written in German Gherkin syntax using `Angenommen`, `Wenn`, `Dann`, and optionally `Und`.
- Use one dashed scenario panel per acceptance criterion or tightly related scenario.
- Scenario titles should be short and outcome-oriented.
- Use `#27ae60` or `#16a085` for `Dann` and `#f39c12` or `#27ae60` for `Und`, depending on context.
- Always include the notes panel. Within the notes, include only entries that carry real information. Omit entries entirely rather than writing `Keine` — if a slice has no risks, do not include a "Risiken" entry. "Was umgesetzt werden soll" and "Blockiert durch" should always be present; all other entries (Technische Hinweise, Annahmen, Abhängigkeiten, Risiken, Offene Fragen) are optional.
- Do not create checkbox lists for acceptance criteria.
- Write for experienced human developers, not for autonomous agents.
- Prefer statements about user-visible behavior, system responses, data outcomes, and constraints over instructions about which files, classes, layers, or methods to change.
- Avoid imperative build plans such as `create`, `implement`, `wire`, `add endpoint`, `update schema`, or similar layer-by-layer task lists unless the user explicitly asks for that level of prescription.
- Keep technical notes brief and decision-relevant; they should support implementation without dictating it. Only include information an experienced developer would not already infer from the slice description and scenarios — tech stack, standard auth rules, and other obvious facts do not belong in technical notes.
- If the PRD includes implementation suggestions, translate them into constraints, dependencies, or assumptions instead of copying them as required tasks.
- Before writing each file, do a final pass that removes step-by-step build language from the title, scenarios, and notes.
- Scenarios must not contain internal code identifiers such as class names (`TimingNormalizationService`), method signatures (`performDummyHash()`), enum constants (`GEHEIMFRAGE`), or database artifacts. If the PRD names such identifiers, translate them into domain language or observable system behavior. The reader should understand *what* the system does, not *which code path* executes.
- **All generated ticket content must be in German** — titles, user stories, scenario names, scenario text, note labels, and note content. The only exceptions are proper nouns, technical terms with no established German equivalent, and code identifiers.
