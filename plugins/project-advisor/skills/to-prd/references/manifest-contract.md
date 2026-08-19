# PRD Manifest Contract

`prd.yaml` is the authoring source; generated `index.html` is the review surface.
The CLI is authoritative for field shapes and supported blocks.

## Rules the CLI does not print

`schema` already prints the field shapes, the supported blocks, and the review-surface constraints. Beyond those:

- `slug`: lowercase kebab-case, published as `action-items/PRD-<slug>/`
- `metadata`: string labels excluding generated `Initiative`, `Review surfaces`, and `Output` labels

## Status lifecycle

`status` is free-form prose and the durable record of the review gate, so downstream skills read it to decide whether a PRD may be split into issues or agent tasks.

- A draft value such as `Draft for review` before review, and again whenever a revision or withdrawal reopens the decision.
- Exactly `Accepted` once the user accepts.

Any other wording reads as unaccepted.

## Blocks

Select only decision-relevant blocks; the generator renders them in canonical order.

- Document: problem, goals, scope, requirements, decisions, risks, testing, and open questions as needed.
- UI: wireframes, annotated screens, UI flow, and design direction when visual state alignment matters.
- Workflow: journeys, workflow diagram, transition matrix, business rules, and failure paths.
- API: contract, dependencies, security and privacy, failure paths, and observable testing outcomes.
- Data: flow, model, lifecycle, privacy, migration, and validation.
- Architecture: system context, diagram, decisions, dependencies, risks, and repository grounding.

## Identity and traceability

ID prefixes: `REQ-*`, `DEC-*`, `RISK-*`, `QUESTION-*`, `TEST-*`, `NODE-*`.
Preserve an ID while its entity's meaning remains stable, and connect entities through supported `relates_to`, `validation`, and `validates` fields.

## Design tree

The optional `design_tree` block records the interview as an ordered list of root nodes, each with optional `children`.
It renders next to the decision log, so a reviewer reads a decision beside the question that produced it.

- Every node names an explicit `NODE-*` id, a short `label`, the verbatim `question`, and a `status`; nested nodes follow the same rule.
- A node id is never generated from its position, because a revision that inserts a branch must not renumber the nodes an earlier review already read.
- `status: settled` carries `answer`, `source`, and `rationale`, and may carry `superseded_answer` when a revision replaced the answer.
- `status: pruned` carries `reason` and no answer, because the branch left PRD scope.
- `status: deferred` carries no answer and names an open question through `relates_to`.
- `source` is `user` for an interview answer or `research` for an agent finding, and a research answer lists its `evidence`.
- Tree nodes stay off the coverage board; they record how the PRD was reasoned out, not a claim that needs validation.

## Visuals

Focus each diagram on one review question, and keep styling and Mermaid features simple.

## Publication

The generator validates the manifest, renders canonical HTML, preserves normalized YAML as `prd.yaml`, copies versioned assets, validates staged output, and then publishes atomically.
It alone writes generated HTML from the working manifest.

**Complete when:** the manifest satisfies every rule above that its initiative type and selected blocks make applicable.
