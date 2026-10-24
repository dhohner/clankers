# German infrastructure Jira template

Use this block for `de` infrastructure tickets, with the shared Jira structure.
Always include `Umfang` and `Pr&uuml;fung und Nachweise`; omit other notes without relevant content.

```html
# <Technisches Ergebnis>

<p dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none"><span style="color:#ff8c00">Nutzer oder Betreiber</span> <span style="color:#008000">erhalten die F&auml;higkeit</span> <span style="color:#2980b9">f&uuml;r den genannten Zweck oder Umfang</span>.</p>

<div class="jePanel_info" style="border:1px solid #9eb6d4; padding:.5em 1em .5em 2.5em">
<p dir="auto"><b>Akzeptanzkriterien </b>(Muss die Anforderung zum Zeitpunkt der Abnahme erf&uuml;llen)</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Szenario 1: Beobachtbares Ergebnis</h2>
<p dir="auto"><span style="color:#2980b9"><b>Angenommen</b></span> der relevante Systemzustand und die Voraussetzungen sind gegeben.</p>
<p dir="auto"><span style="color:#ff8c00"><b>Wenn</b></span> der Betreiber oder das System die Aktion ausf&uuml;hrt.</p>
<p dir="auto"><span style="color:#27ae60"><b>Dann</b></span> tritt das beobachtbare Ergebnis ein.</p>
</div>

<div class="jePanel_idea" style="border:1px solid #d4d39e; padding:.5em 1em .5em 2.5em">
<p dir="auto"><b>Hinweise</b></p>
</div>
<ul>
<li><b>Umfang:</b> Betroffene Systeme, Umgebungen, Ressourcen und Ausschl&uuml;sse.</li>
<li><b>Verbindliche Vorgaben:</b> Anforderungen an Technologie, Architektur, Sicherheit und Richtlinien.</li>
<li><b>Pr&uuml;fung und Nachweise:</b>
<ul>
<li>Gemeinsamer Pr&uuml;fablauf und Umgebung mit Zuordnung zu benannten Szenarien.</li>
<li>Relevante statische Konfigurationspr&uuml;fungen.</li>
<li>Erwartete bereinigte Ergebnisse pro Fall, ohne diese als bereits beobachtet darzustellen.</li>
</ul>
</li>
<li><b>Blockiert durch:</b> Titel des erforderlichen Vorg&auml;ngers und &uuml;bernommener Vertrag.</li>
<li><b>Abh&auml;ngigkeiten:</b> Externe Voraussetzungen und verantwortliche Teams.</li>
<li><b>Betrieb:</b> Relevante Anforderungen an Lebenszyklus, Wiederherstellung und Verantwortung.</li>
<li><b>Annahmen:</b> Wesentliche Annahmen und ihre Auswirkung.</li>
<li><b>Risiken:</b> Relevante Risiken f&uuml;r Umsetzung oder Betrieb.</li>
<li><b>Offene Entscheidungen:</b> Offene Entscheidungen, verantwortliche Teams und Auswirkungen, soweit bekannt.</li>
</ul>
```

Repeat the scenario panel as required by the source.
For optional `Und` steps, use `<span style="color:#f39c12"><b>Und</b></span>`.
