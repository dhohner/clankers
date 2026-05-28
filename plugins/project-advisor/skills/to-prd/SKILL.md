---
name: to-prd
description: "Interviews the user until the problem, constraints, tradeoffs, scope, and likely module boundaries are concrete, then saves a styled HTML PRD for human review and later issue-splitting. Use When: the user asks for a PRD, feature spec, requirements doc, planning brief, or wants to turn a fuzzy idea, conversation, draft, or rough product proposal into something the team can review and plan from — even if they never say 'PRD'."
---

# Write a PRD

Do not rush into a document. Reach shared understanding first, then capture that understanding in a PRD that can survive follow-up planning.

Keep the PRD focused on stable planning decisions. Only produce the companion implementation notes file when the user explicitly includes the phrase `with debug`. Without that exact toggle phrase, keep interpretation notes internal and do not create the extra artifact.

Treat the interview as the core work. Keep going until the major uncertainties are either resolved or explicitly recorded as open questions.

## Operating principles

Whenever you need answers from the user, prefer an interactive question tool over plain chat questions. If such a tool exists, batch related questions into one round, offer predefined options where that speeds things up, and allow multi-select when useful. If no dedicated tool exists, fall back to a concise numbered list in the chat.

Keep each interview round focused. Ask 3-6 sharp questions, synthesize what changed, inspect the repo or the implications of the answers, then ask the next round.

Inspect the repository before you get deep into the interview. Use it to verify what already exists, what terms and workflows recur, what domain documentation already says, and what technical constraints the user may not have mentioned yet.

Use domain documentation to sharpen language and catch contradictions, not to turn the session into a documentation-maintenance detour.

Do not assume the environment has Python, Node, or any other runtime beyond basic file editing and the tools already available.

Maintain a running list of interpretation notes as you work. Every time you resolve ambiguity, reject a plausible alternative, or intentionally narrow or expand the brief, record it for yourself so you can either use it in the final notes file when the user said `with debug` or fold only the necessary settled decisions into the PRD when they did not.

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

During the interview and solution sketch, challenge the feature idea against existing domain documentation and code evidence when that helps resolve the current planning decision.

Prioritize terminology, boundary, and behavior conflicts that would change the PRD.

When the user uses a vague or overloaded term, propose a precise canonical term and ask for confirmation.

When boundaries between concepts are still fuzzy, pressure-test them with one or two concrete scenarios instead of staying abstract.

If a terminology or policy conflict suggests follow-up documentation work, mention it as a possible follow-up only after the PRD is stable. Do not turn this skill into a documentation-writing workflow.

### 3. Run the relentless interview

Before the first serious interview round, read [references/interview-map.md](references/interview-map.md).

Use it as a map, not a script. Do not mechanically ask every question. Instead, use it to find the next unresolved decision that blocks shared understanding.

After each round:

- summarize what is now confirmed
- call out assumptions that are still provisional
- note any terminology or durable decision mismatch that still affects scope, naming, or behavior
- identify the next decision cluster to resolve
- think through implications before continuing

Keep going until you can explain the feature in concrete terms across problem, users, behavior, constraints, scope boundaries, and testing intent without hand-waving.

### 4. Sketch the solution shape

Once the problem is understood, sketch the major modules or capabilities that will likely be built or changed.

Confirm the shape with the user:

- present the proposed modules or capability areas
- ask whether the breakdown matches their expectations
- ask which areas they expect strong automated test coverage for

### 5. Draft the PRD and, when `with debug` is present, the implementation notes file

Before writing, read [references/prd-template.html](references/prd-template.html). Read [references/implementation-notes-template.html](references/implementation-notes-template.html) only if the user explicitly included the phrase `with debug`.

Use this filename pattern for the PRD: `action-items/PRD-<short-slug>.html`

Only when the user explicitly said `with debug`, create a companion file named `implementation-notes.html` alongside the PRD. If that exact filename would collide with unrelated notes already in the workspace, append the same short slug and tell the user which path you used.

Always create the PRD directly from the bundled HTML template structure. Preserve the inline CSS and semantic layout so the PRD is pleasant to read in a browser and easy to scan during review. Create the notes file from its bundled template only when the user said `with debug`.

Write the PRD in English. Keep proper nouns, product names, established technical terms, and code identifiers as-is rather than translating them. Escape user-provided text as needed so the HTML stays valid and does not accidentally execute markup.

Do not include fragile implementation trivia such as exact file paths or code snippets unless the user explicitly asks for them.

Do not include process commentary about the interview loop, offline execution, missing reviewer interaction, or other agent-environment constraints inside the PRD. Keep the document focused on the product plan itself. If that meta context matters, keep it internal or place it in the companion notes file only when the user said `with debug`.

When the PRD contains unresolved context, make it easy to audit. Use the `Further Notes` section to separate `Assumptions`, `Open Questions`, and `Rollout / Migration Notes` when those categories contain meaningful information. Omit empty cards or subsections rather than adding placeholders.

When the user said `with debug`, the companion notes file should explain anything the user should know about how the PRD was interpreted or where it diverges from the brief. Always include these sections:

- `Design Decisions` - choices you made because the input or repo context was ambiguous
- `Deviations` - intentional departures from the user's input, stated assumptions, or nearby repo patterns, with reasons
- `Tradeoffs` - alternatives you considered and why the chosen path won
- `Open Questions` - things the user should confirm, revise, or supply before implementation

Keep each note short and auditable: what changed, why, and how it affects the PRD or next step. If a section has nothing material, say so briefly instead of leaving it blank.

If the user did not say `with debug`, do not mention the notes file, do not create it, and do not hold user approval hostage on an artifact they did not ask to enable. Also do not surface the `with debug` toggle mechanism itself anywhere in the PRD — it is an internal skill feature, not a product decision, and it must not appear in open questions, implementation decisions, or any other section of the output document.

### 6. Review and finalize

Read [references/review-checklist.md](references/review-checklist.md) and fix issues inline before asking anyone to review the PRD. Apply the notes-file checks only when the user said `with debug`.

The PRD should be coherent enough that later issue-splitting will not drift because of missing decisions, contradictions, or vague scope boundaries.

If subagents are available, run a reviewer loop in a review-oriented subagent using the PRD file path and, when the request included `with debug`, the notes file path, and ask it to return either `Approved` or `Issues Found`. If subagents are not available, perform the same review inline yourself **with a fresh set of eyes**.

The reviewer should approve unless there are substantive problems in completeness, consistency, clarity, decision quality, or scope that would cause bad issue decomposition or implementation drift.

When the request included `with debug`, the reviewer should also reject the pair if the notes file omits a material ambiguity, contradiction, deviation, tradeoff, or user confirmation that would change how the PRD is read.

- If the review finds issues, fix the PRD and review again.
- If the same disagreement repeats 3 times, or the review loop exceeds 5 total passes, stop and ask the user how to proceed.

After the review loop passes, make the generated PRD easy for the user to review. Prefer the environment's browser or file-preview tool when one is available. If no such tool is available, or opening the file requires approval that is not granted, provide the PRD path and keep going.

Then ask the user to review the PRD and, when present, the implementation notes. If an interactive question tool exists, offer quick options such as `Accepted`, `Needs changes`, and `Let me review it first`.

If the user requests changes, update the PRD and rerun the review loop, then make the updated HTML file available for review again before asking for acceptance.

If user review is not possible in the current environment, do not pretend the output is fully approved. Leave it as draft pending user review, and explicitly record what still needs user confirmation.

Record the unresolved product decisions themselves, not the mechanics of why review did not happen. The PRD can stay in draft status without narrating the missing review loop inside the document.

Only treat the output as finished when the review loop and the user review pass for the PRD, plus the notes companion when the request included `with debug`.

### 7. Offer the issue handoff

Once the PRD is finalized and the user marks the human review as accepted, offer to break it into Jira-ready work items with the `to-issues` skill.

Invoke `to-issues` with the PRD path only when the user asks for the handoff, accepts an offered handoff, or originally requested an end-to-end PRD-to-issues workflow. Otherwise, confirm the saved PRD location and, when applicable, the implementation notes location, then stop.

If the user does not accept the PRD yet, keep the PRD in draft review state and do not invoke `to-issues`.
