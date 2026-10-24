# Slice Design Checklist

Each slice proves a narrow path through the relevant system boundaries.
For product work, use tracer bullets that demonstrate application behavior.
For infrastructure work, use independently verifiable capabilities and prerequisite contracts.

## Coverage

Maintain a coverage map from source requirement IDs, goals, constraints, and acceptance scenarios to proposed slices.
Group related requirements when they produce one demoable outcome.
Split thick outcomes until each slice can be implemented and verified without carrying unrelated behavior.
Keep shared constraints visible in every slice they govern.

## Slice test

Each slice must answer:

- What user-visible or system-verifiable behavior changes?
- How can a reviewer demonstrate completion?
- Which relevant boundaries does the thin end-to-end path cross?
- Can it land independently, or does it require a predecessor?
- Does its acceptance boundary describe behavior rather than code structure?

For product work, replace API-only, database-only, UI-only, migration-only, test-only, and architecture-foundation tickets with vertical outcomes.
For infrastructure work, allow prerequisites such as identity federation or a state backend when they establish independently verifiable, usable contracts.
Name each prerequisite's consumer, delivered contract, verification method, and expected evidence.
A separate owner or delivery boundary can justify this split.
An internal code layer alone cannot.
Use other engineering boundaries only when they materially improve quality, simplicity, robustness, scalability, or maintainability and preserve a verifiable outcome.

## Dependencies

Name a predecessor only when the slice cannot be meaningfully implemented or verified without it.
Keep independently releasable slices independent, including work that can land behind a flag or partial exposure.
Order the final set by real prerequisites, then by the earliest useful product outcome.

## AFK and HITL

Classify a slice as `HITL` when implementation requires an unresolved product, design, architecture, policy, or compliance decision.
Classify all other slices as `AFK`.
Use these labels only in breakdown planning unless the user asks for them in the final Jira content.

## Approval gate

In `default` mode, present the breakdown before creating files unless the user has already approved it or explicitly authorizes direct writing.
Explicit instructions to assume approval, skip review, or write files directly authorize drafting.
An explicit request for a proposal, review, or confirmation keeps the approval gate active.

For each proposed slice, show:

- **Title**: short outcome-oriented name
- **Type**: `HITL` or `AFK`
- **Profile**: `product` or `infrastructure`
- **Blocked by**: genuine predecessor slices, if any
- **Requirements covered**: source requirement IDs and goals

Ask whether the granularity, dependencies, and classifications are correct.
In `brief` mode, proceed directly unless multiple plausible breakdowns would materially change the Jira files; then ask the smallest question that selects a stable breakdown.

Before drafting, check coverage, slice boundaries, dependencies, classifications, and the applicable approval.
