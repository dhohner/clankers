# Tracer-bullet slice design

Apply this reference to the coverage ledger before proposing or writing tasks.

## Five tests

Every tracer-bullet slice must:

1. Deliver one user-visible or system-verifiable outcome.
2. Contain the smallest end-to-end change that makes that outcome real.
3. Remain cohesive enough for one coding-agent run, with no second independently valuable outcome hidden inside it.
4. Have focused completion evidence in behavior, tests, or repository artifacts.
5. Depend only on predecessor capabilities required to produce its own outcome.

## Shaping rules

Start from observable scenarios and outcomes, then fold database, API, UI, migration, refactor, documentation, and test work into the outcome they enable.
Use an engineering capability as a standalone slice only when it is independently verifiable and a later outcome genuinely requires it first.

Split a candidate when it contains independently releasable outcomes, materially different risk or validation, or an unavoidable sequencing boundary.
Combine requirements when one end-to-end demonstration proves them more clearly and without hiding a second outcome.
Keep testing-strategy items with the behavioral slice whose completion they prove.

Express dependencies as capabilities that must already exist, including the reason each capability is required.
Remove ordering edges based only on task numbering, preferred implementation sequence, or shared files.

Mark a slice blocked only when safe implementation requires a human decision, external access, unavailable artifact, unresolved contract, or predecessor capability.
Name the exact missing input and the decision or evidence needed to unblock it.
Block only the part that the missing input actually prevents; when the rest of the outcome can still ship and be verified, keep it in the slice rather than deferring the whole requirement.

## Completion criterion

Slicing is complete when every implementable ledger item maps to at least one slice, every non-implementation item has an explicit disposition, every slice passes all five tests, and every dependency edge enables an outcome that otherwise cannot be completed.
