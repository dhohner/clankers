# Beispiel-Ticket

Diese Datei dient als Referenz für Ton, Detailgrad und den Unterschied zwischen einem guten Jira-Schnitt und einer Implementierungs-Checkliste.

Domain-Details nicht wörtlich übernehmen, sofern sie nicht zum aktuellen PRD passen. Struktur, ergebnisorientierte Formulierung und Hinweis-Dichte wiederverwenden.

Das gesamte Ticket ist auf Deutsch verfasst — Titel, User Story, Szenario-Namen, Szenario-Text, Hinweis-Labels und Hinweis-Inhalte. Nur Eigennamen, technische Fachbegriffe ohne etabliertes deutsches Äquivalent und Code-Bezeichner bleiben englisch.

## Beispiel-Ausgabe

```text
# Rechnungsdokumente aus der Bestellhistorie öffnen

<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">
Als <span style="color:#ff8c00">angemeldeter Bestandskunde</span> m&ouml;chte ich <span style="color:#008000">meine verf&uuml;gbaren Rechnungen direkt aus der Bestellhistorie &ouml;ffnen</span> damit <span style="color:#2980b9">ich Routinefragen zu fr&uuml;heren Bestellungen selbst kl&auml;ren kann</span>
</h2>

<div class="jePanel_info" style="border:1px solid #9eb6d4; padding:.5em 1em .5em 2.5em">
<p dir="auto"><b>Akzeptanzkriterien </b>(Muss die Anforderung zum Zeitpunkt der Abnahme erf&uuml;llen)</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Szenario 1: Verf&uuml;gbare Rechnung &ouml;ffnen</h2>
<p dir="auto"><span style="color:#2980b9"><b>Angenommen</b></span> ein angemeldeter Kunde betrachtet eine eigene Bestellung mit verf&uuml;gbarer Rechnung</p>
<p dir="auto"><span style="color:#ff8c00"><b>Wenn</b></span> der Kunde die Rechnung aus der Bestellliste oder der Detailansicht &ouml;ffnet</p>
<p dir="auto"><span style="color:#27ae60"><b>Dann</b></span> wird das zu dieser Bestellung geh&ouml;rende Rechnungsdokument ohne Supportkontakt bereitgestellt</p>
<p dir="auto"><span style="color:#f39c12"><b>Und</b></span> der Zugriff ist nachvollziehbar protokolliert und nur f&uuml;r diese Kundenbestellung m&ouml;glich</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Szenario 2: Fehlerfall ohne Kontextverlust</h2>
<p dir="auto"><span style="color:#2980b9"><b>Angenommen</b></span> der Kunde befindet sich in der Bestellhistorie oder in einer Bestelldetailansicht und der Rechnungsabruf schl&auml;gt vor&uuml;bergehend fehl</p>
<p dir="auto"><span style="color:#ff8c00"><b>Wenn</b></span> der Fehler angezeigt wird</p>
<p dir="auto"><span style="color:#16a085"><b>Dann</b></span> erh&auml;lt der Kunde eine verst&auml;ndliche, erneut ausl&ouml;sbare Fehlersituation</p>
<p dir="auto"><span style="color:#27ae60"><b>Und</b></span> die aktuelle Seite, der gew&auml;hlte Auftrag und bestehende Filter bleiben erhalten</p>
</div>

<div class="jePanel_idea" style="border:1px solid #d4d39e; padding:.5em 1em .5em 2.5em">
<p dir="auto"><b>Hinweise</b></p>
</div>

<p dir="auto"><b>Was umgesetzt werden soll:</b> Kunden k&ouml;nnen Rechnungs-PDFs aus der Bestellhistorie und der Bestelldetailansicht &ouml;ffnen, wenn eine Rechnung verf&uuml;gbar ist. Ist noch keine Rechnung vorhanden, wird dies verst&auml;ndlich kommuniziert statt stillschweigend zu scheitern.</p>
<p dir="auto"><b>Blockiert durch:</b> Slice Bestellhistorie-Browsing verf&uuml;gbar</p>
<p dir="auto"><b>Technische Hinweise:</b> Fokus auf benutzersichtbaren Zugriff, Autorisierungsgrenzen, Nachvollziehbarkeit und wiederholbare Fehlerbehandlung. Speicher- und Transportdetails als Implementierungsentscheidung behandeln, sofern das PRD keine harte Vorgabe macht.</p>
<p dir="auto"><b>Annahmen:</b> Rechnungsdokumente existieren bereits f&uuml;r berechtigte Bestellungen und k&ouml;nnen auf Anfrage abgerufen werden.</p>
<p dir="auto"><b>Abh&auml;ngigkeiten:</b> Authentifizierter Kundenkontext, Pr&uuml;fung der Bestellzugeh&ouml;rigkeit, Rechnungsdokumentquelle und Compliance-Protokollierung.</p>
<p dir="auto"><b>Risiken:</b> Fehlerhafte oder mehrdeutige Rechnungslinks k&ouml;nnten das falsche Dokument anzeigen oder Supportkontakte erzeugen statt sie zu reduzieren.</p>
<p dir="auto"><b>Offene Fragen:</b> Sollen Rechnungszugriffe nur erfolgreiche &Ouml;ffnungen oder auch abgelehnte und fehlgeschlagene Versuche erfassen?</p>
```

---

## Beispiel-Ausgabe (schlankes Ticket)

Nicht jedes Ticket braucht die gleiche Tiefe. Wenn der Sachverhalt einfach ist, reichen wenige Szenarien und eine einzige Notiz. Leere Abschnitte weglassen statt mit „Keine" füllen.

```text
# Personenlisten-Export mit aktiven Filtern

<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">
Als <span style="color:#ff8c00">Nutzer der B2B-Anwenderverwaltung</span> m&ouml;chte ich <span style="color:#008000">beim Export der Personenliste, dass alle aktuell aktiven Filter angewendet werden</span> damit <span style="color:#2980b9">ich genau die erwarteten Datens&auml;tze exportiere und keine Nachbearbeitung notwendig ist</span>
</h2>

<div class="jePanel_info" style="border:1px solid #9eb6d4; padding:.5em 1em .5em 2.5em">
<p dir="auto"><b>Akzeptanzkriterien </b>(Muss die Anforderung zum Zeitpunkt der Abnahme erf&uuml;llen)</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Szenario 1: Filter&uuml;bernahme beim Export</h2>
<p dir="auto"><span style="color:#2980b9"><b>Angenommen</b></span> ich befinde mich auf der Personen&uuml;bersicht und habe Filter gesetzt</p>
<p dir="auto"><span style="color:#ff8c00"><b>Wenn</b></span> ich auf den Button &ldquo;Export&rdquo; klicke</p>
<p dir="auto"><span style="color:#16a085"><b>Dann</b></span> enth&auml;lt die exportierte Datei ausschlie&szlig;lich Datens&auml;tze, die allen aktiven Filtern entsprechen</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Szenario 2: Keine Filter gesetzt</h2>
<p dir="auto"><span style="color:#2980b9"><b>Angenommen</b></span> es sind keine Filter aktiv</p>
<p dir="auto"><span style="color:#ff8c00"><b>Wenn</b></span> ich den Export starte</p>
<p dir="auto"><span style="color:#16a085"><b>Dann</b></span> enth&auml;lt die exportierte Datei alle verf&uuml;gbaren Personen</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Szenario 3: Kombination mehrerer Filter</h2>
<p dir="auto"><span style="color:#2980b9"><b>Angenommen</b></span> ich habe mehrere Filter gleichzeitig gesetzt</p>
<p dir="auto"><span style="color:#ff8c00"><b>Wenn</b></span> ich exportiere</p>
<p dir="auto"><span style="color:#16a085"><b>Dann</b></span> werden die Filter logisch korrekt kombiniert</p>
</div>

<div class="jePanel_idea" style="border:1px solid #d4d39e; padding:.5em 1em .5em 2.5em">
<p dir="auto"><b>Hinweise</b></p>
</div>

<ul>
<li><b>Was umgesetzt werden soll:</b> Paginierung hat keinen Einfluss auf den Export &mdash; Export basiert auf gesamtem gefiltertem Resultset.</li>
<li><b>Blockiert durch:</b> Keine &ndash; kann sofort begonnen werden</li>
</ul>
```
