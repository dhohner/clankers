# English infrastructure Jira template

Use this block for `en` infrastructure tickets, with the shared Jira structure.
Always include `Scope` and `Verification and evidence`; omit other notes without relevant content.

```html
# <Technical outcome>

<p dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none"><span style="color:#ff8c00">Consumer or operator</span> <span style="color:#008000">receives the capability</span> <span style="color:#2980b9">for the stated purpose or scope</span>.</p>

<div class="jePanel_info" style="border:1px solid #9eb6d4; padding:.5em 1em .5em 2.5em">
<p dir="auto"><b>Acceptance criteria </b>(must be met at the time of acceptance)</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Scenario 1: Observable outcome</h2>
<p dir="auto"><span style="color:#2980b9"><b>Given</b></span> the relevant system state and prerequisites.</p>
<p dir="auto"><span style="color:#ff8c00"><b>When</b></span> the operator or system performs the action.</p>
<p dir="auto"><span style="color:#27ae60"><b>Then</b></span> the observable result occurs.</p>
</div>

<div class="jePanel_idea" style="border:1px solid #d4d39e; padding:.5em 1em .5em 2.5em">
<p dir="auto"><b>Notes</b></p>
</div>
<ul>
<li><b>Scope:</b> Covered systems, environments, resources, and exclusions.</li>
<li><b>Required constraints:</b> Binding technology, architecture, security, and policy requirements.</li>
<li><b>Verification and evidence:</b>
<ul>
<li>Shared execution procedure and environment, mapped to named scenarios.</li>
<li>Relevant static configuration checks.</li>
<li>Expected sanitized results for each case, without claiming they have already been observed.</li>
</ul>
</li>
<li><b>Blocked by:</b> Required predecessor title and inherited contract.</li>
<li><b>Dependencies:</b> External prerequisites and their owners.</li>
<li><b>Operations:</b> Relevant lifecycle, recovery, and ownership requirements.</li>
<li><b>Assumptions:</b> Material assumptions and their impact.</li>
<li><b>Risks:</b> Relevant delivery or operational risks.</li>
<li><b>Open decisions:</b> Unresolved choices, owners, and delivery impact where known.</li>
</ul>
```

Repeat the scenario panel as required by the source.
For optional `And` steps, use `<span style="color:#f39c12"><b>And</b></span>`.
