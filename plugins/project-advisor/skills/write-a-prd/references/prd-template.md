# PRD Template

Use this structure for every generated PRD.

The file should live at `action-items/PRD-<short-slug>.md` and start with this frontmatter:

```yaml
---
type: prd
status: draft
created: YYYY-MM-DD
---
```

## Required sections

### Problem Statement

Describe the problem from the user's perspective.

Answer questions like:

- What is painful, blocked, risky, or inefficient today?
- Who experiences that problem most directly?
- Why is it worth solving now?

### Solution

Describe the intended solution from the user's perspective.

Focus on the future behavior and workflow, not implementation mechanics.

### User Stories

Write a long numbered list of user stories in this form:

`As an <actor>, I want a <feature>, so that <benefit>`

Cover the full feature surface, including:

- primary happy paths
- important variants and edge cases
- operational or admin workflows when relevant
- failure handling when it materially affects user behavior

### Implementation Decisions

Record the key technical and product decisions that shape execution.

This can include:

- major modules or capability areas to build or change
- interface or contract decisions
- architecture choices
- schema or API implications
- clarifications that remove ambiguity for later planning

Prefer stable decisions over brittle detail. Avoid exact file paths and code snippets unless the user explicitly wants them.

### Testing Decisions

Capture what good verification looks like.

Include:

- the behaviors that most need confidence
- which modules or capability areas deserve direct tests
- what a good test proves from the outside
- similar prior art in the repo when available

Bias toward externally visible behavior instead of implementation detail.

### Out of Scope

Name the work that is intentionally excluded.

This section should make later issue slicing safer by preventing quiet scope creep.

### Further Notes

Use this for open questions, rollout notes, migration concerns, or other context that does not fit cleanly elsewhere.

When any of these categories are present, structure this section with short subheadings:

- `### Assumptions`
- `### Open Questions`
- `### Rollout / Migration Notes`

Omit subheadings that would be empty.

## Writing guidance

- Write the PRD in English.
- Keep proper nouns, product names, established technical terms, and code identifiers as-is.
- Prefer concrete language over strategic filler.
- Make uncertainty explicit when a decision is still open.
- Separate assumptions, open questions, and rollout or migration concerns instead of mixing them into settled decisions.
- Keep the document focused enough to decompose into coherent Jira-ready work items.
