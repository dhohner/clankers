# Slice design

Apply these rules to the source map before proposing or writing tasks.

## Five tests

Every slice must:

1. Deliver one user-visible or system-verifiable outcome.
2. Contain the smallest end-to-end change that makes that outcome real.
3. Fit one coding agent run and hide no second independently valuable outcome.
4. Have focused completion evidence in behavior, tests, or repository artifacts.
5. Depend only on predecessor capabilities required to produce its own outcome.

## Shaping rules

Start from observable scenarios and outcomes.
Fold database, API, UI, migration, refactor, documentation, and test work into the outcome it enables.
Make an engineering capability its own slice only when it is independently verifiable and a later outcome requires it first.

Split a candidate that contains independently releasable outcomes, materially different risk or validation, or an unavoidable sequencing boundary.
Combine requirements when one end-to-end demonstration proves them together without hiding a second outcome.
Keep testing strategy items with the slice whose completion they prove.

State why each predecessor capability is required.
Remove ordering edges based only on task numbering, preferred implementation sequence, or shared files.

Mark a slice blocked only when safe implementation needs a human decision, external access, an unavailable artifact, an unresolved contract, or a predecessor capability.
Name the exact missing input and the decision or evidence that unblocks it.

## Completion criterion

Slicing is complete when:

- Every implementable source item maps to at least one slice.
- Every non-implementation item has an explicit disposition.
- Every slice passes the five tests.
- Every dependency edge enables an outcome that cannot complete without it.
