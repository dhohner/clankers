# Interview Map

Use this map to drive the PRD interview until you and the user share the same mental model of the feature. Treat it as a decision map, not a script.

The right next question is the one whose answer would most change the PRD.

## Target Understanding

By the time you stop interviewing, you should be able to explain:

- what problem matters enough to solve now
- who feels the pain and in which workflow
- what change in behavior the solution introduces
- what constraints or tradeoffs shape the solution
- where the feature begins and ends
- what must be true for the implementation to be considered correct

If one of those points is unclear, ask about it or carry it into the PRD as a labeled assumption or open question. Do not fill it with a plausible story.

## Decision Clusters

### Problem

Clarify:

- what is broken, painful, slow, risky, or missing today
- why this matters now instead of later
- what happens if the team does nothing

### Users and actors

Clarify:

- the primary actor
- secondary actors affected by the change
- who benefits, who pays the cost, and who can block adoption

### Workflow

Clarify:

- what the user does today
- where the handoff, delay, or confusion happens
- what the improved flow should feel like end-to-end

### Scope

Clarify:

- what is explicitly in scope
- what feels adjacent but should stay out of scope
- whether the work is one coherent initiative or several hidden projects

### Rules and States

Clarify:

- business rules
- data or state transitions
- important edge cases
- failure paths and fallback behavior

### Constraints

Clarify:

- technical constraints
- organizational or process constraints
- compliance, localization, rollout, migration, or compatibility concerns
- explicit tradeoffs the team is willing to make

### Quality Bar

Clarify:

- what must be true for the feature to count as correct
- what user-visible behavior deserves direct testing
- what regressions the team is most worried about

## Useful Question Patterns

Use concrete prompts when the discussion is still abstract:

- "Walk me through the current path step by step."
- "Where does the user get stuck, wait, or guess?"
- "What should be different in the future flow from the user's perspective?"
- "What tempting adjacent work should stay out of this PRD?"
- "If we shipped a narrower first version, what still has to be included?"
- "What conditions change the outcome?"
- "What happens when data is missing, stale, or invalid?"
- "What would make you confident this shipped correctly?"

## Round structure

Run the interview in loops:

1. Pick one unresolved decision cluster.
2. Ask a focused round of 3-6 questions, fewer when one answer is likely decisive.
3. Summarize `Confirmed`, `Provisional`, and `Open`.
4. Inspect the repo or think through implications.
5. Choose the next cluster or draft if the remaining gaps are safe to label.

Present each round in a scannable format. Prefer short bucketed bullets followed by numbered questions. Do not bury multiple questions inside a narrative paragraph.

Preferred shape:

```md
Confirmed

- ...

Open

- ...

Questions

1. ...
2. ...
```

## Exit criteria

You are ready to draft the PRD when all of the following are true:

- the user agrees with the problem framing
- the desired behavior is concrete enough to describe without vague filler
- major scope boundaries are explicit
- important constraints and edge cases are named
- the likely module or capability breakdown is credible
- the testing section can describe external behavior worth validating

If one of these is still weak and would change planning, keep interviewing. If it is weak but not blocking, put it in `Further Notes` instead of inventing a decision.
