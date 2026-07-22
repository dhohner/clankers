# Contract precision pass

Evaluate every heading for each triggered slice.
Give each applicable decision one of the dispositions in the completion criterion.
Ground details in the PRD or inspected repository evidence, and keep the task technology-neutral where the evidence leaves implementation open.

## Vocabulary and state

- Define controlled vocabularies and the meaning of every allowed value.
  Distinguish persisted state, domain-event classification, operation name, and user-facing label when they differ.
- Define legal state transitions, actors, preconditions, terminal states, and behavior for invalid or repeated transitions.
- Define behavior below, at, and above each threshold, including zero, missing, expired, or already-completed state where applicable.

## Durable data and authority

- Define each durable entity needed by the slice: repository-grounded name, identifiers, fields and meanings, relationships, optionality, defaults, units, precision, and lifecycle.
- State compatibility requirements for existing records, legacy values, migrations, and absent optional fields.
- Name the authoritative source for time, identity, ordering, quantities, and derived values.
  Distinguish observation time from domain-event time when both matter.
- State required lookup and uniqueness behavior.
  Name a physical index only when repository evidence or an accepted access pattern requires one.

## Operations, replay, and concurrency

- Define each operation's inputs, preconditions, recorded result, and behavior when requested state exceeds available state.
- Make replay guarantees operation-specific.
  Naturally convergent operations may be replay-safe without request identity; cumulative, decrementing, or externally visible operations require an action identity for true idempotency.
- Define concurrent-request behavior, conflict resolution, ordering guarantees, and server-enforced invariants.
- State the narrower guarantee explicitly when the available identity or storage contract cannot support full idempotency or ordering.

## Atomicity and failure

- Identify state changes and history records that must become visible together.
  Define the atomic boundary, rollback behavior, and success and failure evidence.
- For external side effects outside that boundary, define dispatch ordering, duplicate handling, retry policy, and reconciliation after partial failure.
- Define recovery behavior for interrupted operations and partially completed legacy state when applicable.

## Authorization and isolation

- Define the authenticated actor, authorization rule, ownership or tenant scope, and role distinctions for every interface introduced or changed.
- Cover read, list, write, retry, and administrative paths that the slice exposes.
- Define observable behavior for denied and cross-scope access without exposing protected information.

## Completion criterion

The contract pass is complete when every applicable item above has exactly one disposition:

1. **Resolved:** an explicit task clause grounded in source evidence, plus focused validation for its success, boundary, and failure behavior, including replay, concurrency, and authorization where applicable.
2. **Blocked:** a blocker naming the unresolved decision and the evidence needed to resolve it.
