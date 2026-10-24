# Deploy the Azure landing zone from both Linux agent pools

<p dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none"><span style="color:#ff8c00">The platform team</span> <span style="color:#008000">deploys the existing Terraform landing zone configuration through Azure DevOps</span> <span style="color:#2980b9">from Hosted Linux and Platform Linux</span>.</p>

<div class="jePanel_info" style="border:1px solid #9eb6d4; padding:.5em 1em .5em 2.5em">
<p dir="auto"><b>Acceptance criteria </b>(must be met at the time of acceptance)</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Scenario 1: Deploy from either pool</h2>
<p dir="auto"><span style="color:#2980b9"><b>Given</b></span> a pipeline run on Hosted Linux or Platform Linux using that pool's existing validation state key.</p>
<p dir="auto"><span style="color:#ff8c00"><b>When</b></span> Terraform init, plan, and approved apply complete.</p>
<p dir="auto"><span style="color:#27ae60"><b>Then</b></span> the configured resource groups and policy assignments exist in the validation subscription for each pool's deployment.</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Scenario 2: Authenticate through federation</h2>
<p dir="auto"><span style="color:#2980b9"><b>Given</b></span> a fresh agent in each supported pool without a preauthenticated session.</p>
<p dir="auto"><span style="color:#ff8c00"><b>When</b></span> the pipeline authenticates to Azure.</p>
<p dir="auto"><span style="color:#27ae60"><b>Then</b></span> both pools use the same existing service connection and managed identity through workload identity federation without an Azure client secret.</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Scenario 3: Repeat the plan</h2>
<p dir="auto"><span style="color:#2980b9"><b>Given</b></span> a completed apply from each pool.</p>
<p dir="auto"><span style="color:#ff8c00"><b>When</b></span> Terraform plan runs again against that pool's same configuration and state.</p>
<p dir="auto"><span style="color:#27ae60"><b>Then</b></span> each plan reports no changes.</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Scenario 4: Deny access outside the deployment scope</h2>
<p dir="auto"><span style="color:#2980b9"><b>Given</b></span> the deployment identity in a pipeline run from each pool.</p>
<p dir="auto"><span style="color:#ff8c00"><b>When</b></span> the pipeline attempts the agreed harmless resource read in the designated outside subscription through the deployment service connection.</p>
<p dir="auto"><span style="color:#27ae60"><b>Then</b></span> the read fails with an authorization error from each pool.</p>
</div>

<div class="jePanel_dashed" style="border:1px dashed #b4b4b4; padding:.5em 1em .5em 2.5em">
<h2 dir="auto" style="color:#00095a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif; font-size:20px; font-weight:500; text-align:start; text-decoration:none">Scenario 5: Wait for apply approval</h2>
<p dir="auto"><span style="color:#2980b9"><b>Given</b></span> a run from each pool whose apply has not been approved.</p>
<p dir="auto"><span style="color:#ff8c00"><b>When</b></span> the pipeline reaches apply.</p>
<p dir="auto"><span style="color:#27ae60"><b>Then</b></span> each run waits for manual approval before apply proceeds.</p>
</div>

<div class="jePanel_idea" style="border:1px solid #d4d39e; padding:.5em 1em .5em 2.5em">
<p dir="auto"><b>Notes</b></p>
</div>
<ul>
<li><b>Scope:</b> Deploy the configured resource groups and policy assignments in the validation subscription.
<ul>
<li>Creating or changing landing zone modules, changing identity or permission scopes, changing recovery policy, and automatically destroying resources are excluded.</li>
</ul>
</li>
<li><b>Required constraints:</b>
<ul>
<li>Use the existing Azure Resource Manager service connection and Azure user assigned managed identity.</li>
<li>Its federated identity credential matches the service connection's issuer, subject, and audience.</li>
<li>Use the existing Azure Storage backend, each pool's existing separate validation state key, and existing backend locking.</li>
<li>Keep the agreed identity, trust, and permission scopes supplied by the cloud security team.</li>
</ul>
</li>
<li><b>Verification and evidence:</b>
<ul>
<li>Run all five scenarios on fresh agents in Hosted Linux and Platform Linux against the validation subscription.</li>
<li>Compare deployed resources with the Terraform configuration after each apply.</li>
<li>Check pipeline authentication and federation metadata against the managed identity's credential.</li>
<li>Review backend locking and each pool's state key mapping.</li>
<li>Never collect raw tokens or Terraform state contents.</li>
<li>Attach sanitized run references for each pool identifying the subscription, state key, and authentication.</li>
<li>Include init/plan/apply results, resource checks, second plan, denied read, and approval wait and record in those references.</li>
<li>Attach configuration review results identifying the shared service connection and identity and their matching issuer, subject, and audience.</li>
</ul>
</li>
<li><b>Dependencies:</b>
<ul>
<li>Both pools already provide the required Terraform version and network access to Azure APIs and the existing Azure Storage backend.</li>
<li>The cloud security team supplies the existing managed identity and service connection federation trust.</li>
<li>It supplies agreed deployment permissions in the validation subscription and backend data access.</li>
<li>The pipeline is already authorized to use the service connection.</li>
</ul>
</li>
<li><b>Operations:</b> The platform team owns operation and follows its existing execution and recovery runbook.</li>
<li><b>Open decisions:</b> The platform team decides whether a later version supports Windows agents without blocking delivery for the two Linux pools.</li>
</ul>
