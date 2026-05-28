---
name: to-prd
description: "Use when the user wants a PRD, feature spec, requirements doc, planning brief, or help turning a fuzzy product idea, conversation, draft, or rough proposal into something reviewable. Interview the user until the problem, users, constraints, scope, tradeoffs, and likely capability boundaries are shared and concrete; ask or mark open questions instead of guessing; then save a styled English HTML PRD for human review and later issue-splitting."
---

# Write a PRD

The interview is the core work. Reach shared understanding first, then capture it in a PRD that can survive issue-splitting and implementation planning.

Do not guess what the user meant. When a decision matters and the evidence is thin, either ask the user or record the uncertainty as an assumption or open question. Never present a plausible invention as a settled requirement.

Only create the companion implementation notes file when the user explicitly includes the phrase `with debug`. Without that exact phrase, keep interpretation notes internal and produce only the PRD.

## Working Contract

Maintain three buckets throughout the work:

- `Confirmed` - decisions stated by the user or strongly evidenced by the repo.
- `Provisional` - assumptions that let planning move forward, clearly labeled.
- `Open` - decisions that would change scope, behavior, rollout, or issue decomposition.

Use an interactive question tool when available. Otherwise ask concise numbered questions in chat.

Keep each interview round small: ask the fewest questions needed to resolve the next blocking decision, usually 3-6. After each answer, synthesize what changed before asking more.

Inspect the repository early unless the workspace is empty or irrelevant. Use code and docs to verify terms, existing workflows, nearby patterns, and constraints the user may not know to mention.

Use repo evidence to sharpen the PRD, not to detour into documentation maintenance. Mention documentation follow-ups only after the PRD is stable.

Do not assume Python, Node, or any other runtime beyond basic file editing and the tools already available.

## Process

### 1. Capture the seed context

Extract what is already known before asking anything new:

- the problem to solve
- the target users or actors
- the desired outcome
- known constraints, deadlines, or non-goals

If the user provided a detailed brief, extract settled decisions first and probe only the gaps. If the idea is still fuzzy, say so plainly and begin the interview.

If the user asks to create the PRD immediately, still resolve blocking ambiguity first. Be explicit that the fastest path is a short clarification pass, not a guessed document.

### 2. Ground the brief

Inspect the repository before the second serious interview round unless the workspace is empty or irrelevant.

Look for:

- what already exists
- adjacent workflows or concepts
- recurring product and code terminology
- durable decisions in docs, tests, schemas, APIs, or ADRs
- constraints that could change scope, behavior, rollout, or testing

When repo evidence conflicts with the user's words, surface the conflict. Ask the user to choose, or record it as an open question if drafting can still proceed.

When the user uses a vague or overloaded term, propose a canonical term and ask for confirmation. When boundaries are fuzzy, pressure-test them with one or two concrete scenarios.

### 3. Interview to Shared Understanding

Before the first serious interview round, read [references/interview-map.md](references/interview-map.md). Use it as a map, not a script.

Choose the next question by asking: "Which missing answer would most change the PRD?"

After each round:

- summarize `Confirmed`, `Provisional`, and `Open`
- call out any terminology, policy, or behavior mismatch that still matters
- identify the next decision cluster, or say why the PRD is ready to draft

Keep interviewing until you can explain the feature concretely across problem, users, behavior, constraints, scope boundaries, and testing intent. Stop asking when remaining unknowns can be safely recorded as assumptions or open questions.

### 4. Confirm the Solution Shape

Before writing, sketch the likely capability or module breakdown in plain product language. Confirm with the user:

- the major capability areas
- the main in-scope and out-of-scope edges
- the behaviors or regressions that deserve explicit test coverage

If the user cannot confirm everything, keep the uncertain parts labeled rather than filling them in silently.

### 5. Draft the PRD

Before writing, read [references/prd-template.html](references/prd-template.html). Read [references/implementation-notes-template.html](references/implementation-notes-template.html) only if the user explicitly included `with debug`.

Use this filename pattern for the PRD: `action-items/PRD-<short-slug>.html`.

Create the PRD directly from the bundled HTML template structure. Preserve the inline CSS and semantic layout. Write in English. Keep proper nouns, product names, established technical terms, and code identifiers as-is. Escape user-provided text so the HTML stays valid and does not execute markup.

Keep the PRD focused on product planning decisions:

- Do not include fragile implementation trivia such as exact file paths or code snippets unless the user explicitly asks.
- Do not include process commentary about the interview, reviewer loop, environment limits, or the `with debug` toggle.
- Put unresolved context in `Further Notes` under `Assumptions`, `Open Questions`, and `Rollout / Migration Notes` when those categories matter. Omit empty placeholders.

When the user said `with debug`, create `implementation-notes.html` next to the PRD unless that would collide with an unrelated file; if so, append the PRD slug and tell the user which path you used. The notes file must contain:

- `Design Decisions` - choices made because input or repo context was ambiguous
- `Deviations` - intentional departures from the user's input, assumptions, or nearby repo patterns
- `Tradeoffs` - alternatives considered and why the chosen path won
- `Open Questions` - things the user should confirm before implementation

### 6. Review and finalize

Read [references/review-checklist.md](references/review-checklist.md) and fix issues before asking anyone to review the PRD. Apply notes-file checks only when `with debug` was requested.

The PRD should be coherent enough that later issue-splitting will not drift because of missing decisions, contradictions, or vague scope boundaries.

If subagents are available, run a reviewer loop using the PRD path and, when relevant, the notes path. Ask for `Approved` or `Issues Found`. If subagents are not available, perform the same review inline with a fresh set of eyes.

- If the review finds issues, fix the PRD and review again.
- If the same disagreement repeats 3 times, or the review loop exceeds 5 total passes, stop and ask the user how to proceed.

After the review loop passes, make the PRD easy for the user to review. Prefer the environment's browser or file-preview tool when available. Otherwise provide the PRD path.

Ask the user to review the PRD and, when present, the implementation notes. If an interactive question tool exists, offer quick options such as `Accepted`, `Needs changes`, and `Let me review it first`.

If the user requests changes, update the PRD and rerun the review loop, then make the updated HTML file available for review again before asking for acceptance.

If user review is not possible, do not pretend the PRD is approved. Leave it as draft pending user review and record the unresolved product decisions themselves, not the mechanics of the environment.

Only treat the output as finished when the review loop and the user review pass for the PRD, plus the notes companion when the request included `with debug`.

### 7. Offer the issue handoff

Once the PRD is finalized and the user marks the human review as accepted, offer to break it into Jira-ready work items with the `to-issues` skill.

Invoke `to-issues` with the PRD path only when the user asks for the handoff, accepts an offered handoff, or originally requested an end-to-end PRD-to-issues workflow. Otherwise, confirm the saved PRD location and, when applicable, the implementation notes location, then stop.

If the user does not accept the PRD yet, keep the PRD in draft review state and do not invoke `to-issues`.
