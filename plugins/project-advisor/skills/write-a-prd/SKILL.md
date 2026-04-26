---
name: write-a-prd
description: "Interviews the user until the problem, constraints, tradeoffs, scope, and likely module boundaries are concrete, then produces a structured English PRD ready for issue-splitting. Use When: the user asks for a PRD, feature spec, or requirements doc; they describe a feature or product idea and want a written plan; they want to turn a conversation, thread, or rough brief into something the team can plan from; they ask how to structure a product proposal; they have a fuzzy idea and need help narrowing it into a Jira-ready document — even if they never use the word 'PRD'."
---

# Write a PRD

Do not rush into a document. Reach shared understanding first, then capture that understanding in a PRD that can survive follow-up planning.

Treat the interview as the core work. Keep going until the major uncertainties are either resolved or explicitly recorded as open questions.

## Operating principles

Whenever you need answers from the user, prefer an interactive question tool over plain chat questions. If such a tool exists, batch related questions into one round, offer predefined options where that speeds things up, and allow multi-select when useful. If no dedicated tool exists, fall back to a concise numbered list in the chat.

Keep each interview round focused. Ask 3-6 sharp questions, synthesize what changed, inspect the repo or the implications of the answers, then ask the next round.

Inspect the repository before you get deep into the interview. Use it to verify what already exists, what terms and workflows recur, and what technical constraints the user may not have mentioned yet.

Do not assume the environment has Python, Node, or any other runtime beyond basic file editing and the tools already available.

## Process

### 1. Capture the seed context

Extract as much as you can from the current conversation before asking anything new. Start by filling gaps around:

- the problem to solve
- the target users or actors
- the desired outcome
- known constraints, deadlines, or non-goals

If the idea is still fuzzy, say so explicitly and begin the interview rather than pretending the brief is already sufficient.

If the user provides an existing document, list of requirements, or detailed brief, extract the settled decisions from it first — do not re-interview about things they have already decided. Only probe the gaps.

### 2. Explore the codebase

Inspect the repository before the second serious interview round unless the workspace is empty or irrelevant.

Use the repo to answer questions like:

- what already exists
- what workflows or concepts are adjacent
- what naming or architectural patterns recur
- what implementation constraints the user may not have mentioned yet

### 3. Run the relentless interview

Before the first serious interview round, read [references/interview-map.md](references/interview-map.md).

Use it as a map, not a script. Do not mechanically ask every question. Instead, use it to find the next unresolved decision that blocks shared understanding.

After each round:

- summarize what is now confirmed
- call out assumptions that are still provisional
- identify the next decision cluster to resolve
- think through implications before continuing

Keep going until you can explain the feature in concrete terms across problem, users, behavior, constraints, scope boundaries, and testing intent without hand-waving.

### 4. Sketch the solution shape

Once the problem is understood, sketch the major modules or capabilities that will likely be built or changed.

Confirm the shape with the user:

- present the proposed modules or capability areas
- ask whether the breakdown matches their expectations
- ask which areas they expect strong automated test coverage for

### 5. Draft the PRD file

Before writing, read [references/prd-template.md](references/prd-template.md).

Use this filename pattern: `action-items/PRD-<short-slug>.md`

Create the file directly from the bundled template structure.

Write the PRD in English. Keep proper nouns, product names, established technical terms, and code identifiers as-is rather than translating them.

Do not include fragile implementation trivia such as exact file paths or code snippets unless the user explicitly asks for them.

When the PRD contains unresolved context, make it easy to audit. Use `Further Notes` to separate `Assumptions`, `Open Questions`, and `Rollout / Migration Notes` when those categories contain meaningful information. Omit empty subheadings rather than adding placeholders.

### 6. Review and finalize

Read [references/review-checklist.md](references/review-checklist.md) and fix issues inline before asking anyone to review the PRD.

The PRD should be coherent enough that later issue-splitting will not drift because of missing decisions, contradictions, or vague scope boundaries.

If subagents are available, run a reviewer loop in a review-oriented subagent using the PRD file path and asking it to return either `Approved` or `Issues Found`. If subagents are not available, perform the same review inline yourself.

The reviewer should approve unless there are substantive problems in completeness, consistency, clarity, decision quality, or scope that would cause bad issue decomposition or implementation drift.

- If the review finds issues, fix the PRD and review again.
- If the same disagreement repeats 3 times, or the review loop exceeds 5 total passes, stop and ask the user how to proceed.

After the review loop passes, ask the user to review the PRD. If an interactive question tool exists, offer quick options such as `Looks good`, `Needs changes`, and `Let me review it first`.

If the user requests changes, update the PRD and rerun the review loop.

If user review is not possible in the current environment, do not pretend the PRD is fully approved. Leave it as draft pending user review, and explicitly record what still needs user confirmation.

Only treat the PRD as finished when both the review loop and the user review pass.

### 7. Offer the next step

Once the PRD is finalized, offer to break it into Jira-ready work items with the `prd-to-issues` skill.

If the user agrees, invoke `prd-to-issues` with the PRD path. Otherwise, confirm the saved PRD location and stop.
