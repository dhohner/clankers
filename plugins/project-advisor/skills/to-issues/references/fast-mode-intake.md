# Fast Mode Intake

Use this guide before the first serious interview round in `fast` mode.

The goal of `fast` mode is not to reconstruct a full PRD. The goal is to collect only the decisions that materially change the resulting slices.

## Extract first

Before asking anything, extract from the current conversation and any referenced files:

- the user or actor
- the capability or business outcome
- obvious constraints or deadlines
- dependencies on existing systems or workflows
- explicit non-goals

If these are already settled, do not re-ask them.

## Ask only for missing decisions that change the tickets

Good `fast` mode questions resolve ambiguity around:

- scope boundaries that change how many slices exist
- rollout or migration constraints
- approval or compliance requirements
- critical dependencies or prerequisite work
- acceptance-criteria differences between plausible behaviors
- ownership or visibility models such as personal versus shared
- whether the feature extends an existing workflow or needs a separate management surface
- whether the first version is automatic, manual, or mixed when that changes the slice set

Avoid asking for background that does not change the decomposition.

Do not paper over missing product decisions by inventing them. If the brief does not specify things like naming rules, deduplication, sharing behavior, permission exceptions, or special recovery flows, leave them out unless they are strongly implied by the repo context or are required to produce a stable slice breakdown.

If a missing decision would change the decomposition, ask about it even when one answer feels more likely. Common examples are personal-versus-shared ownership, whether invalid configurations need visible handling in V1, and whether users stay in the existing workflow or switch to a new management surface.

## Good question shapes

Batch related questions into one round when possible.

- Which actors need the first usable version: internal operators, end users, or both?
- Is this intended for a limited rollout, or should the first slice already be production-ready for everyone?
- Are there hard dependencies or existing flows this must extend rather than replace?

## When to stop asking

Stop as soon as you can produce stable, outcome-oriented slices with credible dependencies and acceptance criteria.

If the user input is strong enough to do that already, do not ask anything.

If a missing detail would change the decomposition, ask about it. If it would not change the decomposition, do not silently turn it into a requirement just because it sounds plausible.

If clarification is impossible in the current context, surface the smallest blocking question and stop rather than drafting tickets around an invented answer.
