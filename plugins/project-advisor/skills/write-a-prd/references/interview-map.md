# Interview Map

Use this map to drive the PRD interview until you and the user share the same mental model of the feature.

Do not ask every question mechanically. Pick the next unresolved branch that matters most.

## What the interview is trying to achieve

By the time you stop interviewing, you should be able to explain:

- what problem matters enough to solve now
- who feels the pain and in which workflow
- what change in behavior the solution introduces
- what constraints or tradeoffs shape the solution
- where the feature begins and ends
- what must be true for the implementation to be considered correct

If you cannot explain one of those points clearly, the interview is not done yet.

## Decision clusters to walk through

### Problem and urgency

Clarify:

- what is broken, painful, slow, risky, or missing today
- why this matters now instead of later
- what happens if the team does nothing

Useful angles to explore:

- What is the current failure, friction, or missed opportunity?
- Who notices the problem first?
- What concrete outcome would make this worth building?

### Users and actors

Clarify:

- the primary actor
- secondary actors affected by the change
- who benefits, who pays the cost, and who can block adoption

Useful angles to explore:

- Who is the main actor in the happy path?
- Who else needs different behavior, permissions, or visibility?
- Is there an operator, admin, or support workflow hiding behind the main feature?

### Current workflow and desired workflow

Clarify:

- what the user does today
- where the handoff, delay, or confusion happens
- what the improved flow should feel like end-to-end

Useful angles to explore:

- Walk me through the current path step by step.
- Where does the user get stuck, wait, or guess?
- What should be different in the future flow from the user's perspective?

### Scope edges

Clarify:

- what is explicitly in scope
- what feels adjacent but should stay out of scope
- whether the work is one coherent initiative or several hidden projects

Useful angles to explore:

- What tempting adjacent work should we avoid folding into this PRD?
- Are there obvious follow-ups that should remain separate?
- If we had to ship a narrower first version, what still has to be included?

### Rules, states, and exceptions

Clarify:

- business rules
- data or state transitions
- important edge cases
- failure paths and fallback behavior

Useful angles to explore:

- What conditions change the outcome?
- What happens when data is missing, stale, or invalid?
- Are there approval, timing, or entitlement rules that matter?

### Constraints and tradeoffs

Clarify:

- technical constraints
- organizational or process constraints
- compliance, localization, rollout, migration, or compatibility concerns
- explicit tradeoffs the team is willing to make

Useful angles to explore:

- What constraints would make one solution acceptable and another impossible?
- Do we need to preserve existing behavior for some users or systems?
- Are there rollout, migration, or policy constraints we need to capture now?

### Quality bar and testing intent

Clarify:

- what must be true for the feature to count as correct
- what user-visible behavior deserves direct testing
- what regressions the team is most worried about

Useful angles to explore:

- What would make you confident this shipped correctly?
- Which behaviors are risky enough that we should name them explicitly in testing decisions?
- Do we already have similar tests or feature patterns in the repo?

## Round structure

Run the interview in loops:

1. Pick one unresolved decision cluster.
2. Ask a focused round of 3-6 questions.
3. Summarize confirmed understanding, provisional assumptions, and open decisions.
4. Inspect the codebase or think through implications.
5. Choose the next cluster.

## Exit criteria

You are ready to draft the PRD when all of the following are true:

- the user agrees with the problem framing
- the desired behavior is concrete enough to describe without vague filler
- major scope boundaries are explicit
- important constraints and edge cases are named
- the likely module or capability breakdown is credible
- the testing section can describe external behavior worth validating

If one of these is still weak, keep interviewing.
