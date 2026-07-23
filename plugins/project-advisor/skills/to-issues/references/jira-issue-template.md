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
<li><b>Was umgesetzt werden soll:</b> Kompakte, eigenst&auml;ndige Beschreibung dieses vertikalen Schnitts. Beschreibe das gew&uuml;nschte End-to-End-Verhalten, das erwartete Ergebnis und wichtige Randbedingungen so, dass die Story ohne Zugriff auf PRD, Briefing oder Quellmaterial verst&auml;ndlich ist. Kein schrittweiser Implementierungsplan.</li>
<li><b>Blockiert durch:</b> <Titel oder Dateiname des erforderlichen Vorg&auml;nger-Slices></li>
<li><b>Technische Hinweise:</b> Optional. Nur essenziellen Kontext, Schnittstellen oder nicht-offensichtliche Randbedingungen festhalten, die einem erfahrenen Entwickler bei der Umsetzung helfen. Keine Aufgabenlisten oder Agent-Anweisungen.</li>
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

## Structural rules

- Preserve the exact panel classes, inline styles, and section order shown above unless the user explicitly requests another format.
- Keep `jePanel_info` limited to the `Akzeptanzkriterien` header paragraph, then close it before all `jePanel_dashed` scenario panels.
- Render one `jePanel_dashed` panel per named acceptance scenario.
- Use German Gherkin keywords with the displayed colors: `Angenommen`, `Wenn`, `Dann`, and optional `Und` lines.
- Keep the user-story connectors uncolored and use `#ff8c00` for the persona, `#008000` for the capability, and `#2980b9` for the benefit.
- Always render `jePanel_idea` with only the `Hinweise` header paragraph, close it, then render note content as a sibling `<ul>` with one `<li>` per included entry.
- Always include `Was umgesetzt werden soll`.
- Include `Blockiert durch`, `Technische Hinweise`, `Annahmen`, `Abh&auml;ngigkeiten`, `Risiken`, and `Offene Fragen` only when they carry real information.
- Render multiple points inside one note entry as a nested `<ul>`; a single point may be inline.
- Acceptance criteria use scenario panels rather than checkbox lists.

The content rules and per-ticket final gate live in [`ticket-writing-checklist.md`](ticket-writing-checklist.md).
