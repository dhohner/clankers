# Beispiel-Ticket

Diese Datei gilt für die Ticketsprache `de`.

Sie dient als Referenz für Ton, Detailgrad und den Unterschied zwischen einem guten Jira-Schnitt und einer Implementierungs-Checkliste.
Das Beispiel zeigt Ticketqualität, deutsches Sprachregister und Begriffswahl.

Domain-Details nicht wörtlich übernehmen, sofern sie nicht zum aktuellen PRD passen.
Struktur, ergebnisorientierte Formulierung und Hinweis-Dichte wiederverwenden.

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
<p dir="auto"><span style="color:#2980b9"><b>Angenommen</b></span> ich betrachte eine eigene Bestellung mit verf&uuml;gbarer Rechnung</p>
<p dir="auto"><span style="color:#ff8c00"><b>Wenn</b></span> ich die Rechnung aus der Bestellliste oder der Detailansicht &ouml;ffne</p>
<p dir="auto"><span style="color:#27ae60"><b>Dann</b></span> erhalte ich das zu dieser Bestellung geh&ouml;rende Rechnungs-PDF</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Szenario 2: Fehlerfall ohne Kontextverlust</h2>
<p dir="auto"><span style="color:#2980b9"><b>Angenommen</b></span> ich betrachte eine eigene Bestellung in der Bestellhistorie oder der Bestelldetailansicht und der externe Abrechnungsdienst ist vor&uuml;bergehend nicht erreichbar</p>
<p dir="auto"><span style="color:#ff8c00"><b>Wenn</b></span> ich die Rechnung &ouml;ffne</p>
<p dir="auto"><span style="color:#16a085"><b>Dann</b></span> erhalte ich eine Fehlermeldung mit einer M&ouml;glichkeit zum erneuten Versuch</p>
<p dir="auto"><span style="color:#27ae60"><b>Und</b></span> meine aktuelle Seite, die gew&auml;hlte Bestellung und bestehende Filter bleiben erhalten</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Szenario 3: Noch keine Rechnung vorhanden</h2>
<p dir="auto"><span style="color:#2980b9"><b>Angenommen</b></span> f&uuml;r eine eigene Bestellung liegt noch keine Rechnung vor</p>
<p dir="auto"><span style="color:#ff8c00"><b>Wenn</b></span> ich diese Bestellung in der Bestellhistorie oder der Bestelldetailansicht betrachte</p>
<p dir="auto"><span style="color:#27ae60"><b>Dann</b></span> sehe ich den Hinweis &bdquo;F&uuml;r diese Bestellung liegt noch keine Rechnung vor.&ldquo;</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Szenario 4: Rechnung einer fremden Bestellung nicht abrufbar</h2>
<p dir="auto"><span style="color:#2980b9"><b>Angenommen</b></span> ich bin angemeldet und habe einen Rechnungslink zu einer Bestellung eines anderen Kunden</p>
<p dir="auto"><span style="color:#ff8c00"><b>Wenn</b></span> ich diesen Rechnungslink aufrufe</p>
<p dir="auto"><span style="color:#27ae60"><b>Dann</b></span> wird der Zugriff abgelehnt und ich erhalte weder das Rechnungsdokument noch dessen Inhalt</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Szenario 5: Rechnungszugriff im Audit Log nachweisen</h2>
<p dir="auto"><span style="color:#2980b9"><b>Angenommen</b></span> ein angemeldeter Kunde hat die Rechnung einer eigenen Bestellung ge&ouml;ffnet</p>
<p dir="auto"><span style="color:#ff8c00"><b>Wenn</b></span> die Compliance-Pr&uuml;fung das Audit Log f&uuml;r diese Bestellung auswertet</p>
<p dir="auto"><span style="color:#27ae60"><b>Dann</b></span> enth&auml;lt es einen Eintrag zur Rechnungs&ouml;ffnung, der dem Kunden und der Bestellung zugeordnet ist</p>
</div>

<div class="jePanel_idea" style="border:1px solid #d4d39e; padding:.5em 1em .5em 2.5em">
<p dir="auto"><b>Hinweise</b></p>
</div>

<ul>
<li><b>Was umgesetzt werden soll:</b> Angemeldete Kunden k&ouml;nnen verf&uuml;gbare Rechnungs-PDFs ihrer eigenen Bestellungen aus der Bestellhistorie und der Bestelldetailansicht &ouml;ffnen.
Fehlende Rechnungen werden angezeigt; bei Abruffehlern bleibt der Bestellkontext erhalten.
Rechnungs&ouml;ffnungen werden im Audit Log erfasst.</li>
<li><b>Blockiert durch:</b> Bestellhistorie anzeigen</li>
<li><b>Technische Hinweise:</b> Die Rechnungs-PDFs liegen beim externen Abrechnungsdienst.</li>
<li><b>Annahmen:</b> Rechnungsdokumente existieren bereits f&uuml;r berechtigte Bestellungen und k&ouml;nnen auf Anfrage abgerufen werden.</li>
<li><b>Offene Fragen:</b> Sollen Rechnungszugriffe nur erfolgreiche &Ouml;ffnungen oder auch abgelehnte und fehlgeschlagene Versuche erfassen?</li>
</ul>
```
