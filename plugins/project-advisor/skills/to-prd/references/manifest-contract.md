# PRD manifest contract

`prd.yaml` is the authoring source, and generated `index.html` is the review surface.
The CLI `schema` command is authoritative for field shapes, supported blocks, and review-surface constraints.
This document holds the rules it does not print.

## Manifest version

`schema_version` selects the contract a manifest follows, and nothing else differs between the accepted versions.

- Version 2 is the current contract and requires the `design_tree` block.
- Version 1 stays valid for a manifest published before the tree existed and keeps the tree optional.
- `template` emits version 2, and `generate` copies the version the source manifest declares into the bundle.
- `validate`, `generate`, and `inspect` report the applied version as `manifest_version`.

## Fields

- `slug`: lowercase kebab-case, published as `action-items/PRD-<slug>/`.
- `metadata`: string labels, excluding the generated `Initiative`, `Review surfaces`, and `Output` labels.

## Status lifecycle

`status` is free-form prose and the durable record of the review gate.
Downstream skills read it to decide whether a PRD may be split into issues or agent tasks.

- Use a draft value such as `Draft for review` before review, and again whenever a revision or withdrawal reopens the decision.
- Use exactly `Accepted` once the user accepts.

Any other wording reads as unaccepted.

## Blocks

Select only decision-relevant blocks.
The generator renders them in canonical order.

- Document: problem, goals, scope, requirements, decisions, risks, testing, and open questions.
- UI: wireframes, annotated screens, UI flow, and design direction when visual state alignment matters.
- Workflow: journeys, workflow diagram, transition matrix, business rules, and failure paths.
- API: contract, dependencies, security and privacy, failure paths, and observable testing outcomes.
- Data: flow, model, lifecycle, privacy, migration, and validation.
- Architecture: system context, diagram, decisions, dependencies, risks, and repository grounding.

## Identity and traceability

ID prefixes are `REQ-*`, `DEC-*`, `RISK-*`, `QUESTION-*`, `TEST-*`, and `NODE-*`.
Keep an ID while its entity's meaning stays stable, and connect entities through `relates_to`, `validation`, and `validates`.

## Design tree

The `design_tree` block records the interview as an ordered list of root nodes with optional `children`.
It renders beside the decision log as one Mermaid graph whose nodes show id, label, and status, and the full node text stays in `prd.yaml`.
A reference to a `NODE-*` id links to that graph.

- Write every node id explicitly, because a revision that inserts a branch must not renumber nodes an earlier review already read.
- A `settled` node carries `superseded_answer` when a revision replaced its answer.
- `source` is `user` for an interview answer and `research` for an agent finding backed by `evidence`.
- Tree nodes stay off the coverage board, because they record how the PRD was reasoned out rather than a claim that needs validation.

## Visuals

Focus each diagram on one review question, and keep styling and Mermaid features simple.

## Publication

The generator validates the manifest, renders canonical HTML, preserves normalized YAML as `prd.yaml`, copies versioned assets, validates the staged output, and publishes atomically.
It alone writes generated HTML from the working manifest.

The manifest is complete when it satisfies every rule above that its initiative type and selected blocks make applicable.
