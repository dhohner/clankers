# Agent-task writing checklist

Before saving each task, verify that it:

- states one observable outcome and its required behavior;
- is understandable without the PRD or other task files;
- names only repository context and validation commands confirmed by inspection;
- preserves requirement IDs only when they aid traceability;
- separates hard constraints and non-goals from non-binding implementation ideas;
- uses observable, source-backed acceptance criteria;
- includes concrete validation and handoff requirements;
- describes prerequisite capabilities and external blockers explicitly;
- defines applicable controlled vocabularies as domain concepts rather than leaving them confused with UI labels or operation names;
- makes applicable durable contracts executable by naming the entity, fields, relationships, optionality, units or precision, authoritative time source, and required lookup paths without inventing storage architecture;
- preserves required legacy values and optional fields without silent normalization;
- states applicable below, equal, above, missing-state, and over-availability behavior, including resulting state and event classification;
- limits retry guarantees to what the operation can actually distinguish, requiring a request identity for replay-safe cumulative changes or narrowing the guarantee;
- states applicable server-enforced invariants, authorization scope, atomic write boundary, and rollback expectations;
- validates applicable boundary branches, replay record counts, no-partial-write behavior, and isolation at the interface level actually introduced by the task;
- uses compact fragments or `cause -> effect -> action` notes only where they remain unambiguous; and
- contains no placeholders, generic advice, speculative architecture, framework assumptions, or layer-by-layer build sequence.
