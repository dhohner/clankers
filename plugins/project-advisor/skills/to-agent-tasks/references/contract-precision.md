# Contract precision

Apply every relevant rule in this contract pass.
Ground each detail in the PRD or repository evidence, and keep the task technology-neutral unless that evidence makes a technology detail necessary for execution.

## Domain and record contract

- Define each controlled vocabulary and each value's meaning.
  Distinguish domain-event classifications, persisted state, UI labels, and operation names.
- Specify the durable record contract needed by this slice and its accepted successors: repository-grounded entity name, fields and meanings, identifiers and relationships, optionality, units or precision, and lookup paths.
- Name an index only when repository evidence confirms it or an accepted access pattern requires it.
- Name the authoritative observation time.
  Use a datastore-managed creation time when the repository provides one; state any distinct source-required domain time separately.
- Preserve required legacy values and absent optional fields exactly.

## Boundary and retry behavior

- Define behavior below, at, and above each threshold, plus already-missing state when applicable.
  State whether each value is rejected, capped, retained, transitioned, or removed, and the resulting durable event classification.
- Make retry guarantees operation-specific.
  A naturally convergent operation can be replay-safe without request identity.
  A cumulative or decrementing operation needs a caller-supplied action identity to distinguish a replay from a second intentional action.
  When no identity exists, state the narrower guarantee.
- State server-enforced availability and invariant checks, including checks duplicated by a client.
- For a request beyond available state, define the amount recorded and every source-backed transition.

## Atomicity and isolation

- Put coupled state and history writes in one atomic operation when partial success violates the contract.
  Define rollback expectations and validate success and failure paths.
- Scope isolation to interfaces introduced by the slice.
  A write-only slice needs authenticated tenant-scoped writes and direct persistence assertions.
  A slice that adds reads states the read authorization boundary explicitly.

The contract pass is complete when every applicable rule is captured for the task as an explicit contract clause and validation check, or as a blocker naming the unresolved decision.
Exact-zero behavior, retry identity, event meaning, field optionality, access paths, and authorization boundaries all count as material decisions.
