# Slice Design Checklist

Read this before proposing or revising the slice breakdown.

## What counts as a good slice

- Each slice delivers a narrow but complete path through the relevant system boundaries.
- A completed slice is demoable or otherwise verifiable on its own.
- Prefer many thin slices over a few thick ones.
- Prefer slices organized around user-visible outcomes, not engineering layers.

## Smells to fix

These usually indicate a bad breakdown:

- a ticket that only changes the API, database, UI, or tests
- a ticket that exists only to "prepare" infrastructure with no user-visible outcome
- a ticket whose acceptance criteria can only talk about code structure
- a dependency chain that forces most slices to wait on a large foundation ticket

## HITL versus AFK

Mark a slice `HITL` only when human interaction is materially required, such as:

- an unresolved architectural choice
- product or design review that meaningfully affects the slice
- policy or compliance sign-off

Otherwise default to `AFK`.

## Dependency heuristics

- Block only when one slice cannot be meaningfully implemented or verified without another.
- Avoid decorative dependencies caused by preferred implementation order.
- If two slices can land independently behind a flag or partial UI exposure, keep them independent.

## Final review before approval

Check whether each slice answers all of these:

- What user-visible behavior changes?
- How could a reviewer tell this slice is done?
- Why is this slice independent from the others?
- Does the ticket avoid turning into a layer-by-layer task list?