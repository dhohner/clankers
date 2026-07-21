# PRD Manifest Contract

`prd.yaml` is the authoring source; generated `index.html` is the review surface.
The CLI is authoritative for field shapes and supported blocks.

## Top level

- `schema_version`: `1`
- `slug`: lowercase kebab-case, published as `action-items/PRD-<slug>/`
- `title`, `summary`, `status`: non-empty strings
- `initiative_type`: `small-feature`, `ui-heavy`, `workflow-heavy`, `api-heavy`, `data-heavy`, `architecture-heavy`, or `mixed`
- `review_surfaces`: every initiative includes `document`; `*-heavy` adds its matching surface; `mixed` adds at least two non-document surfaces
- `metadata`: string labels excluding generated `Initiative`, `Review surfaces`, and `Output` labels
- `blocks`: non-empty mapping of supported block names

## Language

Use English in every user-visible field, including titles, summaries, statuses, metadata, block content, tables, visual descriptions, wireframes, and Mermaid labels.
Reserve German for exact repository-backed identifiers, filenames, API names, product labels, or domain idioms.
For retained German, attach evidence when its field supports it; otherwise quote it as repository terminology.

## Blocks

Select only decision-relevant blocks; the generator renders them in canonical order.

- Document: problem, goals, scope, requirements, decisions, risks, testing, and open questions as needed.
- UI: wireframes, annotated screens, UI flow, and design direction when visual state alignment matters.
- Workflow: journeys, workflow diagram, transition matrix, business rules, and failure paths.
- API: contract, dependencies, security and privacy, failure paths, and observable testing outcomes.
- Data: flow, model, lifecycle, privacy, migration, and validation.
- Architecture: system context, diagram, decisions, dependencies, risks, and repository grounding.

## Identity and traceability

Assign durable IDs:

- `REQ-*`: requirements
- `DEC-*`: decisions
- `RISK-*`: risks
- `QUESTION-*`: open questions
- `TEST-*`: testing outcomes

Preserve an ID while its entity's meaning remains stable.
Connect entities through supported `relates_to`, `validation`, and `validates` fields.
Connect every requirement to a validation outcome or explicit `exception`.
Add `evidence` only when an exact repository reference materially supports the statement.

## Visuals

Give every visual a concise text description.
Represent each diagram as small, readable Mermaid `source` focused on one review question.
Use meaningful labels and include failure, fallback, decision, or boundary paths when they affect scope or acceptance.
Keep styling and Mermaid features simple.

## Publication

The generator validates the manifest, renders canonical HTML, preserves normalized YAML as `prd.yaml`, copies versioned assets, validates staged output, and then publishes atomically.
It alone writes generated HTML from the working manifest.

**Complete when:** every applicable contract above is satisfied.
