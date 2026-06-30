# PRD Manifest Contract

Use this when `schema`, focused fixtures, or validation output are not enough.
The bundled generator validates and renders the YAML manifest.
Do not hand-author generated HTML.

For compact field details, prefer:

```sh
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py schema
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py schema <block> [block ...]
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py template --blocks <block> [block ...]
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py examples
```

Block schema output includes tiny valid example fragments.
Use `template --blocks` for a valid placeholder manifest with selected blocks already shaped.
Use `examples/minimal-prd.yaml` for the smallest valid manifest skeleton.
Use `examples/basic-prd.yaml` only for broad mixed examples.
Use `evals/fixtures/*.yaml` for focused document, UI, workflow, API, data, or architecture examples.

## Required top-level fields

- `schema_version`: `1`
- `slug`: lowercase kebab-case, published as `action-items/PRD-<slug>/`
- `title`, `summary`, `status`: non-empty strings
- `initiative_type`: `small-feature`, `ui-heavy`, `workflow-heavy`, `api-heavy`, `data-heavy`, `architecture-heavy`, or `mixed`
- `review_surfaces`: include `document`, include the matching surface for `*-heavy`, and use at least two non-document surfaces for `mixed`
- `metadata`: string labels only, excluding generated labels such as `Initiative`, `Review surfaces`, and `Output`
- `blocks`: non-empty mapping of supported block names

## Language

Write every user-visible field in English.
This includes titles, summaries, statuses, metadata, block content, table labels, diagram descriptions, wireframe labels, and Mermaid labels.
Preserve German only for exact repository-backed identifiers, filenames, API names, product labels, or domain idioms.
When a retained German phrase supports evidence, attach the relevant repository evidence.
Otherwise quote it visibly as repository terminology.

## Block selection

Pick blocks because they improve a product decision.
Omit empty or irrelevant blocks.
The generator renders selected blocks in canonical order.

- Document-only: problem, goals, scope, requirements, decisions, risks, testing, and open questions as needed.
- UI: wireframes, annotated screens, UI flow, and design direction when visual state alignment matters.
- Workflow: journeys, workflow diagram, transition matrix, business rules, and failure paths.
- API: API contract, dependencies, security/privacy, failure paths, and observable testing outcomes.
- Data: data flow, data model, lifecycle, privacy, migration, and validation.
- Architecture: system context, architecture diagram, decisions, dependencies, risks, and repository grounding.

## Stable entities and traceability

Use stable IDs for durable entities:

- requirements: `REQ-*`
- decisions: `DEC-*`
- risks: `RISK-*`
- open questions: `QUESTION-*`
- testing outcomes: `TEST-*`

Connect entities with `relates_to`, `validation`, and `validates` where supported.
Every requirement must connect to a validation outcome or include an explicit `exception`.
Add `evidence` only when an exact repository reference materially supports the statement.

## Visual content

Every diagram or visual surface needs a concise text description.
Use Mermaid `source` for every diagram.
Keep Mermaid diagrams small, readable as source fallback, and focused on one review question.
Show failure, fallback, decision, or boundary paths when they affect scope or acceptance.
Avoid decorative styling and clever Mermaid features.

## Generation

From the repository root:

```sh
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py validate /path/to/prd.yaml
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py generate /path/to/prd.yaml
```

The generator validates the manifest, renders the bundle, preserves normalized YAML as `prd.yaml`, copies versioned assets, validates staged output, and publishes the bundle directory only after checks pass.
