# English Jira template

Use this block for ticket language `en` and apply every shared structural rule.

## English block (`en`)

```text
# <Slice title>

<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">
As <span style="color:#ff8c00"><persona></span> I want <span style="color:#008000"><capability></span> so that <span style="color:#2980b9"><benefit></span>
</h2>

<div class="jePanel_info" style="border:1px solid #9eb6d4; padding:.5em 1em .5em 2.5em">
<p dir="auto"><b>Acceptance criteria </b>(must be met at the time of acceptance)</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Scenario 1: <scenario name></h2>
<p dir="auto"><span style="color:#2980b9"><b>Given</b></span> ...</p>
<p dir="auto"><span style="color:#ff8c00"><b>When</b></span> ...</p>
<p dir="auto"><span style="color:#27ae60"><b>Then</b></span> ...</p>
<p dir="auto"><span style="color:#f39c12"><b>And</b></span> ...</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Scenario 2: <scenario name></h2>
<p dir="auto"><span style="color:#2980b9"><b>Given</b></span> ...</p>
<p dir="auto"><span style="color:#ff8c00"><b>When</b></span> ...</p>
<p dir="auto"><span style="color:#16a085"><b>Then</b></span> ...</p>
<p dir="auto"><span style="color:#27ae60"><b>And</b></span> ...</p>
</div>

<div class="jePanel_idea" style="border:1px solid #d4d39e; padding:.5em 1em .5em 2.5em">
<p dir="auto"><b>Notes</b></p>
</div>

<ul>
<li><b>What to build:</b> Describe the slice's behavior across relevant boundaries, expected result, and important limits.
Keep the description concise and understandable without the PRD, brief, or source material.
Describe the outcome; leave the implementation sequence to engineering.</li>
<li><b>Blocked by:</b> <Title or filename of the required predecessor slice></li>
<li><b>Technical notes:</b> Optional.
Include only essential context, interfaces, or hidden boundaries that help an experienced developer implement the outcome.
Keep the notes focused on constraints; leave tasks and agent instructions to engineering.</li>
<li><b>Assumptions:</b>
<ul>
<li>...</li>
<li>...</li>
</ul>
</li>
<li><b>Dependencies:</b>
<ul>
<li>...</li>
<li>...</li>
</ul>
</li>
<li><b>Risks:</b>
<ul>
<li>...</li>
<li>...</li>
</ul>
</li>
<li><b>Open questions:</b>
<ul>
<li>...</li>
<li>...</li>
</ul>
</li>
</ul>
```
