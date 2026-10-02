# Example Ticket

This file applies to ticket language `en`.

It is a reference for tone, level of detail, and the difference between a good Jira slice and an implementation checklist.
This example demonstrates ticket quality, English register, and term choices.

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
<p dir="auto"><span style="color:#27ae60"><b>Then</b></span> I get the invoice PDF for that order</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Scenario 2: Failure without losing context</h2>
<p dir="auto"><span style="color:#2980b9"><b>Given</b></span> I am looking at one of my own orders in the order history or the order detail view and the external billing provider is temporarily unreachable</p>
<p dir="auto"><span style="color:#ff8c00"><b>When</b></span> I open the invoice</p>
<p dir="auto"><span style="color:#16a085"><b>Then</b></span> I get an error message with a way to try again</p>
<p dir="auto"><span style="color:#27ae60"><b>And</b></span> my current page, the order I picked, and the filters I set are still there</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Scenario 3: No invoice available yet</h2>
<p dir="auto"><span style="color:#2980b9"><b>Given</b></span> one of my own orders has no invoice yet</p>
<p dir="auto"><span style="color:#ff8c00"><b>When</b></span> I look at that order in the order history or the order detail view</p>
<p dir="auto"><span style="color:#27ae60"><b>Then</b></span> I see the message &ldquo;No invoice is available for this order yet.&rdquo;</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Scenario 4: Refuse access to another customer's invoice</h2>
<p dir="auto"><span style="color:#2980b9"><b>Given</b></span> I am signed in and have an invoice link for another customer's order</p>
<p dir="auto"><span style="color:#ff8c00"><b>When</b></span> I open that invoice link</p>
<p dir="auto"><span style="color:#27ae60"><b>Then</b></span> access is refused and I get neither the invoice document nor its contents</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Scenario 5: Verify invoice access in the audit log</h2>
<p dir="auto"><span style="color:#2980b9"><b>Given</b></span> a signed-in customer has opened the invoice for one of their own orders</p>
<p dir="auto"><span style="color:#ff8c00"><b>When</b></span> the compliance review examines the audit log for that order</p>
<p dir="auto"><span style="color:#27ae60"><b>Then</b></span> the log contains an invoice-opening entry linked to the customer and the order</p>
</div>

<div class="jePanel_idea" style="border:1px solid #d4d39e; padding:.5em 1em .5em 2.5em">
<p dir="auto"><b>Notes</b></p>
</div>

<ul>
<li><b>What to build:</b> Signed-in customers open available invoice PDFs for their own orders from the order history and the order detail view.
The page indicates missing invoices; failed requests preserve the order context.
Invoice openings are recorded in the audit log.</li>
<li><b>Blocked by:</b> Show the order history</li>
<li><b>Technical notes:</b> Invoice PDFs live with the external billing provider.</li>
<li><b>Assumptions:</b> Invoice documents already exist for eligible orders and can be fetched on request.</li>
<li><b>Open questions:</b> Does invoice access record only successful opens, or refused and failed attempts as well?</li>
</ul>
```
