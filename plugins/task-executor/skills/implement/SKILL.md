---
name: implement
description: >-
  Implement one `to-agent-tasks` task through red-green TDD, requirement verification, and independent review-fix loops.
  Use when the user names a task file or number, or requests the next task.
---

# Implement an agent task

Treat the task file as the contract for its outcome, boundaries, and validation.

## Step 1 - Select and gate the task

Select the named task, or the sole task in `action-items/agent-tasks/`.
If neither identifies one task, list the candidates and ask the user.
Set each loop's limit to the user's verification limit, or three passes by default.

Require `Outcome`, `Required behavior`, `Acceptance`, and `Validation` sections.
Stop and report a missing section or any blocker under `Boundary`.
Record `git rev-parse HEAD`, `git status --short`, and each pre-existing working-tree change.
Track task-changed files and scope later verification verdicts to them.
Modify only `May change` content and preserve every `Must survive` property.
Create a decision ledger for every `Your call` item.

**Complete when:** One unblocked task passes the structure and boundary gates, with its baseline, limits, and ledger recorded.

## Step 2 - Implement with TDD

Run this red-green loop for every `Required behavior` and `Acceptance` item:

1. Add a test that expresses the item.
2. Run it and confirm it fails because the behavior or planned symbol is absent.
3. Write the smallest implementation that passes the test.
4. Refactor only while the tests remain green.

Classify dependency, discovery, syntax, fixture, and unrelated import failures as setup failures.
Fix setup failures and rerun the test before implementing behavior.
Record each delegated choice and rationale in the decision ledger.
Run every task `Validation` command as settling proof.
Stop and report any material decision the task leaves unsettled.

**Complete when:** Every item has observed red-green evidence, every delegated choice is recorded, and every validation command passes.

## Step 3 - Verify requirement coverage

Run a fresh verifier subagent with this prompt:

```text
Verify <task file path> against changes in <changed files>.
Read the task, changed code, tests, and recorded decisions.
Recorded Your call decisions:
<decision ledger, or "None">
Prior rejected gaps:
<gap, boundary evidence, and rationale, or "None">
Treat only task-delegated Your call decisions as binding.
Reassess every rejected gap independently.
Flag decisions outside the delegated boundary as gaps.
Classify every Required behavior and Acceptance item as covered or a gap.
Covered requires implementation plus observed test or Validation evidence.
Run the task's safe Validation commands.
Preserve the working tree and make no edits.
Report each classification with evidence.
For each gap, name the missing behavior and location.
```

Give every gap one disposition before the next pass:

- Fix valid, in-scope gaps through the red-green loop.
- Resolve gaps through the ledger only when `Your call` delegates the decision.
- Reject gaps only with boundary evidence and rationale.
- Stop and report gaps that expose an unsettled material decision.

Send the fixes, ledger, and rejected gaps to a fresh verifier.
Repeat until a verifier reports full coverage or the coverage limit is spent.
Record every gap remaining after the final pass.

**Complete when:** A verifier reports full coverage, or every final gap has a recorded disposition.

## Step 4 - Run the review loop

Run a fresh review subagent with this prompt:

```text
Invoke the Skill tool with skill "refactor-tools:review-changes" and these arguments:
review <changed files>; the change implements <task file path>.
Recorded Your call decisions:
<decision ledger, or "None">
Treat only task-delegated Your call decisions as binding.
Flag decisions outside the delegated boundary.
Follow the skill exactly and make no edits.
Return its full report with every finding's location, cost, evidence, and fix.
```

A review passes only when it says merge-ready and every dimension scores at least `8` or `n/a`.
Treat findings in dimensions scored `8-9` as deferred nits.
Continue when the verdict and scores disagree.

When another pass remains:

- Fix every valid, in-scope finding in a dimension scored `7` or lower.
- Reject findings only with rationale consistent with the task boundary.
- Use the red-green loop for fixes with an observable required outcome.
- Remove obsolete tests for unsupported behavior removed without a replacement contract, then rerun task validation.
- Run a fresh review after fixes or an inconsistent verdict.

Preserve the reviewed code on the final pass.
Record each non-nit finding as unresolved or rejected with rationale.
Record a final verdict-score disagreement as unresolved.

**Complete when:** A review passes, or every final finding and disagreement has a disposition after the limit is spent.

## Step 5 - Report

Map every `Required behavior` and `Acceptance` item to its implementation and observed validation evidence.
For each review pass, report its finding count and resulting fixes.
Report deferred nits, rejected findings, unresolved findings, rejected gaps, and unresolved gaps separately.
Give a rationale for every rejection.
List verdict-score disagreements, blockers, assumptions, and the decision ledger.
Classify validation as new-behavior coverage, regression coverage, or manual verification.
Name every untested item.

**Complete when:** The report accounts for every task item, review pass, decision, and unresolved issue.
