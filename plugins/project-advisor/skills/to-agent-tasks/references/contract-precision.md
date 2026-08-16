# Contract precision pass

Evaluate every applicable item for each triggered slice.
Resolve it from PRD or repository evidence, or add a blocker with the evidence needed to resolve it.
Keep implementation open where evidence does not fix it.
Write one compact task clause per resolved decision.

## Vocabulary and state

- Define allowed values and distinguish persisted state, event class, operation name, and user label when they differ.
- Define legal transitions, actors, preconditions, terminal states, and invalid or repeated transition behavior.
- Define behavior below, at, and above thresholds, including zero, missing, expired, and completed states when relevant.

## Durable data and authority

- Define each entity's repository-grounded name, identifiers, fields, meanings, relationships, optionality, defaults, units, precision, and lifecycle.
- State compatibility for existing records, legacy values, migrations, and missing optional fields.
- Name authoritative sources for time, identity, ordering, quantities, and derived values, and distinguish observation time from event time when needed.
- Define lookups and uniqueness, but require a physical index only when repository evidence or an accepted access pattern does.

## Operations, replay, and concurrency

- Define each operation's inputs, preconditions, result, and behavior when the request exceeds available state.
- Define replay per operation: naturally convergent operations may be replay-safe without request identity, while cumulative, decrementing, or externally visible effects need an action identity for true idempotency.
- Define concurrent behavior, conflict resolution, ordering, and server-enforced invariants.
- State any weaker guarantee when available identity or storage cannot support full idempotency or ordering.

## Atomicity and failure

- Define which state and history changes become visible together, including rollback and success or failure evidence.
- For external effects, define dispatch order, duplicate handling, retries, and partial-failure reconciliation.
- Define recovery for interrupted operations and partial legacy state when applicable.

## Authorization and isolation

- Define the actor, authorization rule, ownership or tenant scope, and role distinctions for each changed interface.
- Cover exposed read, list, write, retry, and administrative paths.
- Define denied and cross-scope behavior without exposing protected information.

## Completion criterion

The pass is complete when every applicable item is either:

1. **Resolved:** an evidence-backed task clause with focused success, boundary, and failure validation, including replay, concurrency, and authorization when relevant.
2. **Blocked:** the unresolved decision and the evidence needed to resolve it.
