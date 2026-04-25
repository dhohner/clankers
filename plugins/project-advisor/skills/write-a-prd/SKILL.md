---
name: write-a-prd
description: Create a PRD through user interview, codebase exploration, and module design, then save as a Jira-ready action item. Use when user wants to write a PRD, create a product requirements document, or plan a new feature.
---

This skill will be invoked when the user wants to create a PRD. You may skip steps if you don't consider them necessary.

**Gathering user input**: Whenever you need answers from the user, prefer an interactive question tool over writing questions as plain chat messages. Many harnesses provide one (e.g. `vscode_askQuestions` in VS Code, or similar). If such a tool is available, batch related questions into a single call, offer predefined options where sensible, and allow multi-select when applicable. If no dedicated tool exists, fall back to a concise numbered list in the chat — but still keep rounds short (3-6 questions) so the user isn't overwhelmed.

1. Collect the initial context from the user. Ask for:
   - A detailed description of the problem they want to solve
   - Any potential ideas or constraints for solutions
   - Target users / actors affected

   If the conversation already contains enough context (e.g. the user pasted a brief or description), extract what you can and only ask about gaps.

2. Explore the repo to verify their assertions and understand the current state of the codebase.

3. Interview the user relentlessly about every aspect of this plan until you reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one.

   Conduct each interview round as a focused batch of questions (use the interactive question tool if available). After receiving answers, explore the codebase or think through implications before asking the next round. Aim for 3-6 questions per round rather than one massive list — this keeps each round digestible while still making progress.

4. Sketch out the major modules you will need to build or modify to complete the implementation. Actively look for opportunities to extract deep modules that can be tested in isolation.

A deep module (as opposed to a shallow module) is one which encapsulates a lot of functionality in a simple, testable interface which rarely changes.

Confirm the module design with the user:

- Present the list of modules and ask whether it matches their expectations (offer "Looks good" / "Needs changes" as options if the tool supports it).
- Ask which modules they want tests written for (allow multi-select if the tool supports it, otherwise ask as a list).

5. Once you have a complete understanding of the problem and solution, use the template below to write the PRD. Save it as a markdown action item in the `action-items/` directory at the repo root.

- File name: `action-items/PRD-<short-slug>.md` (e.g. `action-items/PRD-user-notifications.md`)
- Include YAML frontmatter with `type: prd`, `status: draft`, and `created: <date>`
- These action items serve as a basis for creating Jira issues in the project.
- Always write the PRD in English. Do not switch to German even if downstream Jira stories or tickets are expected to be in German — that language conversion happens in the ticket-writing step.
- Keep proper nouns, product names, established technical terms, and code identifiers as-is rather than translating them.

6. After writing the PRD, do a quick self-review before asking anyone else to look at it.

- Placeholder scan: remove any `TODO`, `TBD`, or obviously incomplete sections.
- Internal consistency: make sure the Problem Statement, Solution, User Stories, Implementation Decisions, Testing Decisions, and Out of Scope sections do not contradict each other.
- Scope check: make sure the PRD is focused enough to become a coherent set of Jira-ready work items rather than multiple unrelated initiatives.
- Ambiguity check: make unclear requirements explicit if they could lead to different issue breakdowns or implementation outcomes.

Fix issues inline. Do not ask the user to review the PRD before this self-review is complete.

7. Run an automatic PRD review loop before handing the document to the user.

Dispatch a general-purpose reviewer subagent with the PRD file path. The reviewer checks:

| Category         | What to Look For                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| Completeness     | Missing sections, placeholders, TODOs, shallow user-story coverage                                    |
| Consistency      | Contradictions between problem, solution, decisions, and scope                                        |
| Clarity          | Requirements ambiguous enough that issue slicing or implementation planning could drift               |
| Decision Quality | Implementation and testing decisions concrete enough to guide follow-up work without prescribing code |
| Scope            | Out-of-scope boundaries are explicit; no major unexplained scope creep                                |

Only flag issues that would cause real problems in follow-up planning or ticket creation. Approve unless there are serious gaps that would lead to bad issue decomposition or implementation drift.

The reviewer returns one of: `Approved` or `Issues Found` with a list.

- If the reviewer returns `Issues Found`, fix the PRD inline and re-dispatch the reviewer.
- Repeat until the reviewer returns `Approved`.
- If the same disagreement persists for 3 iterations, or the loop exceeds 5 iterations, stop and ask the user how to proceed.

8. After the automatic review loop passes, use the interactive question tool (if available) to ask the user to review the written PRD. Offer options such as "Looks good", "Needs changes", and "Let me review it first" so the user can respond quickly.

- If the user requests changes, update the PRD and re-run the automatic review loop.
- Only treat the PRD as ready once both the reviewer loop and the user review pass.

9. Once the PRD is finalized, offer to break it into Jira-ready work items using the `prd-to-issues` skill. A PRD on its own captures the _what_ and _why_ but doesn't give the team grabbable tickets — the natural next step is slicing it into vertical issues.

Use the interactive question tool (if available) to ask the user whether they'd like to proceed with issue breakdown now. Offer predefined options such as "Yes, break it into issues now" and "No, I'll do it later". If they agree, invoke the `prd-to-issues` skill with the PRD file path. If they decline or want to do it later, confirm the PRD location and wrap up.

<prd-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this PRD.

## Further Notes

Any further notes about the feature.

</prd-template>
