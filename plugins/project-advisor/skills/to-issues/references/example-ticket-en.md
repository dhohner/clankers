# Example Ticket

This file applies to ticket language `en`.

It is a reference for tone, level of detail, and the difference between a good Jira slice and an implementation checklist.
Register and term choice follow `ticket-writing-checklist.md` and `language-en.md`, and this example shows both applied.

Do not copy the domain details unless they fit the PRD at hand.
Reuse the structure, the outcome-oriented phrasing, and the note density.

## Example output

```text
# Open invoice documents from the order history

<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">
As a <span style="color:#ff8c00">signed-in returning customer</span> I want <span style="color:#008000">to open my available invoices straight from the order history</span> so that <span style="color:#2980b9">I can settle routine questions about earlier orders myself</span>
</h2>

<div class="jePanel_info" style="border:1px solid #9eb6d4; padding:.5em 1em .5em 2.5em">
<p dir="auto"><b>Acceptance criteria </b>(must be met at the time of acceptance)</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Scenario 1: Open an available invoice</h2>
<p dir="auto"><span style="color:#2980b9"><b>Given</b></span> I am looking at one of my own orders that has an invoice</p>
<p dir="auto"><span style="color:#ff8c00"><b>When</b></span> I open the invoice from the order list or from the detail view</p>
<p dir="auto"><span style="color:#27ae60"><b>Then</b></span> I get the invoice document for that order without contacting support</p>
<p dir="auto"><span style="color:#f39c12"><b>And</b></span> my access is recorded in the audit log and stays limited to my own orders</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Scenario 2: Failure without losing context</h2>
<p dir="auto"><span style="color:#2980b9"><b>Given</b></span> I am in the order history or in an order detail view and the invoice request fails for the moment</p>
<p dir="auto"><span style="color:#ff8c00"><b>When</b></span> I see the error</p>
<p dir="auto"><span style="color:#16a085"><b>Then</b></span> I get an error message with a way to try again</p>
<p dir="auto"><span style="color:#27ae60"><b>And</b></span> my current page, the order I picked, and the filters I set are still there</p>
</div>

<div class="jePanel_idea" style="border:1px solid #d4d39e; padding:.5em 1em .5em 2.5em">
<p dir="auto"><b>Notes</b></p>
</div>

<ul>
<li><b>What to build:</b> Customers open invoice PDFs from the order history and from the order detail view whenever an invoice exists.
When no invoice exists yet, the page says so in plain language instead of failing silently.</li>
<li><b>Blocked by:</b> Show the order history</li>
<li><b>Technical notes:</b> Invoice PDFs live with the external billing provider, and an outage there still has to leave the order history readable.
Treat storage and transport details as an implementation decision unless a hard constraint says otherwise.</li>
<li><b>Assumptions:</b> Invoice documents already exist for eligible orders and can be fetched on request.</li>
<li><b>Dependencies:</b> Authenticated customer context, order ownership check, invoice document source, and compliance logging.</li>
<li><b>Risks:</b> A wrong or ambiguous invoice link shows the wrong document, or creates the support contacts this is meant to remove.</li>
<li><b>Open questions:</b> Does invoice access record only successful opens, or refused and failed attempts as well?</li>
</ul>
```

---

## Example output (lean ticket)

Not every ticket needs the same depth.
When the matter is simple, a few scenarios and a single note are enough.
Leave empty sections out instead of filling them with "None".

```text
# Export the people list with the active filters

<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">
As a <span style="color:#ff8c00">user of the B2B user administration</span> I want <span style="color:#008000">the export of the people list to apply every filter I have set</span> so that <span style="color:#2980b9">I export exactly the records I expect and have no cleanup afterwards</span>
</h2>

<div class="jePanel_info" style="border:1px solid #9eb6d4; padding:.5em 1em .5em 2.5em">
<p dir="auto"><b>Acceptance criteria </b>(must be met at the time of acceptance)</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Scenario 1: Filters carry into the export</h2>
<p dir="auto"><span style="color:#2980b9"><b>Given</b></span> I am on the people overview and have set filters</p>
<p dir="auto"><span style="color:#ff8c00"><b>When</b></span> I click the "Export" button</p>
<p dir="auto"><span style="color:#16a085"><b>Then</b></span> the exported file holds only records that match every active filter</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Scenario 2: No filters set</h2>
<p dir="auto"><span style="color:#2980b9"><b>Given</b></span> I have set no filters</p>
<p dir="auto"><span style="color:#ff8c00"><b>When</b></span> I start the export</p>
<p dir="auto"><span style="color:#16a085"><b>Then</b></span> the exported file holds every person I can see in the list</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Scenario 3: Several filters at once</h2>
<p dir="auto"><span style="color:#2980b9"><b>Given</b></span> I have set several filters at the same time</p>
<p dir="auto"><span style="color:#ff8c00"><b>When</b></span> I export</p>
<p dir="auto"><span style="color:#16a085"><b>Then</b></span> the exported file holds only records that match the combined filter set</p>
</div>

<div class="jePanel_idea" style="border:1px solid #d4d39e; padding:.5em 1em .5em 2.5em">
<p dir="auto"><b>Notes</b></p>
</div>

<ul>
<li><b>What to build:</b> Pagination has no effect on the export.
The export covers the whole filtered result set.</li>
</ul>
```
