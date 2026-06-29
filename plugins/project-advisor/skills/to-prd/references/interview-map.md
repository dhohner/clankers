# Interview Map

Use this only when a PRD request is broad, vague, or stuck.
It is a decision map, not an intake script.
The right next question is the answer that would most change scope, behavior, rollout, risk, or validation.

## Target understanding

Before drafting, be able to explain:

- what problem matters enough to solve now;
- who feels the pain and in which workflow;
- what behavior changes after the solution ships;
- what constraints or tradeoffs shape the solution;
- where the feature begins and ends;
- what must be true for the implementation to count as correct.

If an answer is missing and material, ask.
If it is missing but not blocking, label it as `Provisional` or `Open` instead of inventing it.

## Decision clusters

### Problem

Clarify what is broken, why now matters, and what happens if nothing changes.

### Users and actors

Clarify the primary actor, affected secondary actors, beneficiaries, costs, and adoption blockers.

### Workflow

Clarify the current path, handoffs, waits, confusion, desired future flow, failure paths, and fallback behavior.

### Scope

Clarify what is in, what is out, and whether the request hides several initiatives.

### Rules and states

Clarify business rules, state transitions, edge cases, missing data, stale data, invalid data, and authorization boundaries.

### Constraints

Clarify technical, organizational, process, compliance, localization, rollout, migration, compatibility, and explicit tradeoff constraints.

### Quality bar

Clarify correctness, user-visible tests, and regressions the team most fears.

## Useful questions

- "Walk me through the current path step by step."
- "Where does the user get stuck, wait, or guess?"
- "What should be different in the future flow from the user's perspective?"
- "What tempting adjacent work should stay out of this PRD?"
- "If we shipped a narrower first version, what still has to be included?"
- "What conditions change the outcome?"
- "What happens when data is missing, stale, or invalid?"
- "What would make you confident this shipped correctly?"

## Round shape

Run short loops:

1. Pick one unresolved decision cluster.
2. Ask 1 to 4 focused questions.
3. Summarize `Confirmed`, `Provisional`, and `Open`.
4. Inspect repo evidence or draft if remaining gaps are safe to label.

Preferred response shape:

```md
Confirmed

- ...

Provisional

- ...

Open

- ...

Questions

1. ...
```
