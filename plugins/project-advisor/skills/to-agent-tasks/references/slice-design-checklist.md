# Tracer-bullet slice checklist

Apply every item before proposing or writing tasks.

A tracer-bullet task:

- produces one user-visible or system-verifiable outcome;
- contains the smallest end-to-end change that makes that outcome real;
- fits one focused coding-agent run;
- has completion evidence observable in the running system, tests, or repository artifacts; and
- depends only on predecessor capabilities required for its own outcome.

Fold database, API, UI, migration, component, refactor, and test work into the outcome they enable.
Use an engineering layer as a standalone slice only when it provides an independently verifiable capability that a later slice genuinely requires.

Split a candidate when it contains independently releasable outcomes, materially different risk or validation, or an unavoidable sequencing boundary.
Combine related requirements when one end-to-end demonstration proves them together more clearly than separate tasks would.

Mark a task blocked only when implementation cannot safely start without a human decision, external access, design artifact, or prerequisite capability.
Name the exact blocker in the affected task.

Slicing is complete when every required behavior appears in the coverage ledger, every slice passes all five tracer-bullet tests above, and the dependency graph contains only outcome-enabling edges.
