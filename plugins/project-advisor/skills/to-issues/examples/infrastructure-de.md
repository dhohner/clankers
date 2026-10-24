# Azure Landing Zone aus beiden Agent Pools ausrollen

<p dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none"><span style="color:#ff8c00">Das Plattformteam</span> <span style="color:#008000">rollt die bestehende Terraform-Konfiguration der Landing Zone</span> <span style="color:#2980b9">aus Hosted Linux und Platform Linux in Azure DevOps</span> aus.</p>

<div class="jePanel_info" style="border:1px solid #9eb6d4; padding:.5em 1em .5em 2.5em">
<p dir="auto"><b>Akzeptanzkriterien </b>(Muss die Anforderung zum Zeitpunkt der Abnahme erf&uuml;llen)</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Szenario 1: Deployment aus beiden Pools</h2>
<p dir="auto"><span style="color:#2980b9"><b>Angenommen</b></span> ein Pipeline Run verwendet Hosted Linux oder Platform Linux mit dem bestehenden State Key des jeweiligen Pools.</p>
<p dir="auto"><span style="color:#ff8c00"><b>Wenn</b></span> Terraform init, plan und das freigegebene apply abgeschlossen sind.</p>
<p dir="auto"><span style="color:#27ae60"><b>Dann</b></span> sind die konfigurierten Resource Groups und Policy Assignments f&uuml;r das Deployment jedes Pools in der Validierungssubscription vorhanden.</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Szenario 2: Authentifizierung durch Federation</h2>
<p dir="auto"><span style="color:#2980b9"><b>Angenommen</b></span> in jedem unterst&uuml;tzten Pool steht ein frischer Agent ohne bestehende Anmeldung bereit.</p>
<p dir="auto"><span style="color:#ff8c00"><b>Wenn</b></span> sich die Pipeline bei Azure authentifiziert.</p>
<p dir="auto"><span style="color:#27ae60"><b>Dann</b></span> verwenden beide Pools dieselbe bestehende Service Connection und Managed Identity mit Workload Identity Federation ohne Azure Client Secret.</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Szenario 3: plan erneut ausf&uuml;hren</h2>
<p dir="auto"><span style="color:#2980b9"><b>Angenommen</b></span> apply ist f&uuml;r jeden Pool abgeschlossen.</p>
<p dir="auto"><span style="color:#ff8c00"><b>Wenn</b></span> Terraform plan mit derselben Konfiguration und demselben State des jeweiligen Pools erneut l&auml;uft.</p>
<p dir="auto"><span style="color:#27ae60"><b>Dann</b></span> zeigt jeder Plan keine &Auml;nderungen.</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Szenario 4: Zugriff au&szlig;erhalb des Deployment Scopes verweigern</h2>
<p dir="auto"><span style="color:#2980b9"><b>Angenommen</b></span> ein Pipeline Run verwendet die Deployment-Identit&auml;t in jedem Pool.</p>
<p dir="auto"><span style="color:#ff8c00"><b>Wenn</b></span> die Pipeline &uuml;ber die Deployment Service Connection den vereinbarten unsch&auml;dlichen Lesezugriff in der benannten externen Subscription versucht.</p>
<p dir="auto"><span style="color:#27ae60"><b>Dann</b></span> scheitert der Zugriff aus jedem Pool mit einem Autorisierungsfehler.</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Szenario 5: Auf Freigabe f&uuml;r apply warten</h2>
<p dir="auto"><span style="color:#2980b9"><b>Angenommen</b></span> apply wurde f&uuml;r einen Run aus jedem Pool noch nicht freigegeben.</p>
<p dir="auto"><span style="color:#ff8c00"><b>Wenn</b></span> die Pipeline apply erreicht.</p>
<p dir="auto"><span style="color:#27ae60"><b>Dann</b></span> wartet jeder Run auf die manuelle Freigabe, bevor apply fortgesetzt wird.</p>
</div>

<div class="jePanel_idea" style="border:1px solid #d4d39e; padding:.5em 1em .5em 2.5em">
<p dir="auto"><b>Hinweise</b></p>
</div>
<ul>
<li><b>Umfang:</b> Konfigurierte Resource Groups und Policy Assignments in der Validierungssubscription bereitstellen.
<ul>
<li>&Auml;nderungen an Landing-Zone-Modulen, Berechtigungsgrenzen und Wiederherstellungsregeln sowie das automatische L&ouml;schen von Ressourcen sind ausgeschlossen.</li>
</ul>
</li>
<li><b>Verbindliche Vorgaben:</b>
<ul>
<li>Die bestehende Azure Resource Manager Service Connection und die bestehende Azure User Assigned Managed Identity verwenden.</li>
<li>Das Federated Identity Credential entspricht Issuer, Subject und Audience der Service Connection.</li>
<li>Bestehendes Azure Storage Backend, separate State Keys pro Pool und bestehendes Backend Locking verwenden.</li>
<li>Vereinbarte Identity-, Trust- und Berechtigungsgrenzen des Cloud-Security-Teams einhalten.</li>
</ul>
</li>
<li><b>Pr&uuml;fung und Nachweise:</b>
<ul>
<li>Alle f&uuml;nf Szenarien auf frischen Agents in Hosted Linux und Platform Linux gegen die Validierungssubscription pr&uuml;fen.</li>
<li>Ressourcen nach jedem apply mit der Terraform-Konfiguration vergleichen.</li>
<li>Authentifizierung und Federation-Metadaten mit dem Credential der Managed Identity abgleichen.</li>
<li>Backend Locking und die Zuordnung der State Keys zu den Pools pr&uuml;fen.</li>
<li>Keine unverarbeiteten Tokens oder Inhalte des Terraform State erfassen.</li>
<li>Bereinigte Run-Referenzen pro Pool mit Subscription, State Key, Authentifizierung, init/plan/apply, Ressourcenpr&uuml;fung, zweitem Plan, verweigertem Zugriff und Freigabeverlauf vorlegen.</li>
<li>Konfigurationspr&uuml;fung mit Referenzen auf Service Connection und Managed Identity sowie passenden Issuer-, Subject- und Audience-Werten beif&uuml;gen.</li>
</ul>
</li>
<li><b>Abh&auml;ngigkeiten:</b>
<ul>
<li>Beide Pools bieten bereits die erforderliche Terraform-Version und Netzwerkzugriff auf Azure APIs und das bestehende Azure Storage Backend.</li>
<li>Das Cloud-Security-Team stellt die bestehende Managed Identity und den Federation Trust bereit.</li>
<li>Es stellt die vereinbarten Deployment-Berechtigungen in der Validierungssubscription und den Datenzugriff auf das Backend bereit.</li>
<li>Die Pipeline ist bereits f&uuml;r die Service Connection autorisiert.</li>
</ul>
</li>
<li><b>Betrieb:</b> Das Plattformteam betreibt die Pipeline nach seinem bestehenden Runbook f&uuml;r Ausf&uuml;hrung und Wiederherstellung.</li>
<li><b>Offene Entscheidungen:</b> Das Plattformteam entscheidet sp&auml;ter &uuml;ber die Unterst&uuml;tzung von Windows Agents, ohne die Umsetzung f&uuml;r die beiden Linux Pools zu blockieren.</li>
</ul>
