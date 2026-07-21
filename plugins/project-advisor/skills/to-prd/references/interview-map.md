# PRD Interview Decision Map

Find the highest-leverage unresolved decision: the answer that would most change scope, behavior, rollout, risk, or validation.

## Decision clusters

Resolve each applicable cluster.

- **Problem:** Establish what is broken, why it matters now, and the cost of inaction.
  - "Where does the user get stuck, wait, or guess?"
  - "What makes this problem worth solving now?"
- **Users and actors:** Identify the primary actor, affected secondary actors, beneficiaries, costs, and adoption blockers.
  - "Who feels the pain, and during which workflow?"
- **Workflow:** Trace the current path, handoffs, waits, desired behavior, failure paths, and fallbacks.
  - "Walk me through the current path step by step."
  - "What should be different in the future flow from the user's perspective?"
- **Scope:** Set initiative boundaries, excluded adjacent work, and any separate initiatives hidden in the request.
  - "What tempting adjacent work should stay out of this PRD?"
  - "If we shipped a narrower first version, what would still have to be included?"
- **Rules and states:** Resolve business rules, transitions, edge cases, authorization boundaries, and missing, stale, or invalid data.
  - "What conditions change the outcome?"
  - "What happens when data is missing, stale, or invalid?"
- **Constraints:** Resolve technical, organizational, process, compliance, localization, rollout, migration, compatibility, and tradeoff constraints.
- **Quality bar:** Define observable correctness and feared regressions.
  - "What would make you confident this shipped correctly?"

## Interview loop

1. Pick the highest-leverage unresolved cluster.
2. Ask one to four focused questions.
3. Summarize answers as `Confirmed`, `Provisional`, and `Open`.
4. Inspect repository evidence for claims it can settle.

Use this response shape:

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

**Complete when:** every material cluster is resolved or explicitly `Provisional` or `Open`.
