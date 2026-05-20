# Review Checklist

Use this checklist before asking either a reviewer subagent or the user to look at the PRD. Apply the notes-specific checks only when the user explicitly requested `with debug`.

## Completeness

- All required PRD sections are present.
- If the user requested `with debug`, the companion `implementation-notes.html` file exists and includes `Design Decisions`, `Deviations`, `Tradeoffs`, and `Open Questions`.
- No placeholder text, TODOs, or obviously unfinished sections remain in the PRD or, when present, the companion notes artifact.
- User stories cover the meaningful parts of the feature rather than only the happy path.
- When unresolved context exists, `Further Notes` separates assumptions, open questions, and rollout or migration concerns clearly enough to review, and the companion notes file makes the same uncertainty easy to audit when `with debug` was requested.

## Consistency

- When the user requested `with debug`, the PRD and the notes describe the same initiative.
- The Problem Statement and Solution describe the same initiative.
- Implementation Decisions do not contradict scope, user stories, testing decisions, or the notes file when it exists.
- Material deviations or tradeoffs called out in the notes are reflected consistently in the PRD when that file exists.
- Out of Scope does not quietly reintroduce work described as core.

## Clarity

- A later issue-splitting step could turn this into work items without guessing the basics.
- Ambiguous requirements are either resolved or named as open questions.
- Important edge cases and constraints are explicit enough to prevent drift.
- When the user requested `with debug`, the notes explain ambiguous choices, intentional departures, and remaining confirmations clearly enough that a reviewer can tell how to read the PRD.
- The PRD does not mix provisional assumptions into settled implementation decisions, and the notes file does not restate settled decisions as if they were still open when it exists.

## Scope quality

- The PRD describes one coherent initiative, not several unrelated projects.
- The scope is narrow enough to plan, but broad enough to be meaningful.
- Adjacent follow-up ideas are kept separate when they would muddy implementation planning.

## Testing quality

- Testing Decisions focus on observable behavior.
- The PRD names the risky behaviors or regressions worth validating.
- Proposed testing areas line up with the module or capability breakdown.

If the PRD or, when enabled, the companion notes artifact fails one of these checks, fix it before moving on.
