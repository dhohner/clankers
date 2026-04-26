# Review Checklist

Use this checklist before asking either a reviewer subagent or the user to look at the PRD.

## Completeness

- All required sections are present.
- No placeholder text, TODOs, or obviously unfinished sections remain.
- User stories cover the meaningful parts of the feature rather than only the happy path.
- When unresolved context exists, `Further Notes` separates assumptions, open questions, and rollout or migration concerns clearly enough to review.

## Consistency

- The Problem Statement and Solution describe the same initiative.
- Implementation Decisions do not contradict scope, user stories, or testing decisions.
- Out of Scope does not quietly reintroduce work described as core.

## Clarity

- A later issue-splitting step could turn this into work items without guessing the basics.
- Ambiguous requirements are either resolved or named as open questions.
- Important edge cases and constraints are explicit enough to prevent drift.
- The document does not mix provisional assumptions into settled implementation decisions.

## Scope quality

- The PRD describes one coherent initiative, not several unrelated projects.
- The scope is narrow enough to plan, but broad enough to be meaningful.
- Adjacent follow-up ideas are kept separate when they would muddy implementation planning.

## Testing quality

- Testing Decisions focus on observable behavior.
- The PRD names the risky behaviors or regressions worth validating.
- Proposed testing areas line up with the module or capability breakdown.

If the document fails one of these checks, fix it before moving on.
