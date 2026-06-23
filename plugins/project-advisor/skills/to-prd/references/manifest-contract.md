# PRD Manifest Contract

Create YAML that the bundled `python3` generator can validate and render. Use [../examples/basic-prd.yaml](../examples/basic-prd.yaml) for a full example and `evals/fixtures/` for focused initiative examples.

## Required top-level fields

- `schema_version`: `1`
- `slug`: lowercase kebab-case; output becomes `action-items/PRD-<slug>/`
- `title`, `summary`, `status`: non-empty strings
- `initiative_type`: `small-feature`, `ui-heavy`, `workflow-heavy`, `api-heavy`, `data-heavy`, `architecture-heavy`, or `mixed`
- `review_surfaces`: one or more of `document`, `ui`, `workflow`, `api`, `data`, and `architecture`
- `metadata`: string-valued labels; do not set generated labels such as `Output`
- `blocks`: a non-empty mapping containing only supported block names

## Block selection

Select blocks because they improve a product decision, not to fill a template.

- Document-only: problem, goals, scope, requirements, decisions, risks, testing, and open questions as needed.
- UI: wireframes, annotated screens, prototype states, UI flow, and design direction when visual state alignment matters.
- Workflow: journeys, workflow diagram, transition matrix, business rules, and failure paths.
- API: API contract, dependencies, security/privacy, failure paths, and observable testing outcomes.
- Data: data flow, data model, lifecycle, privacy, migration, and validation.
- Architecture: system context, architecture diagram, decisions, dependencies, risks, and repository grounding.

Omit empty or irrelevant blocks. The generator renders selected blocks in canonical order.

## Stable entities and traceability

Use explicit stable IDs for durable entities:

- requirements: `REQ-*`
- decisions: `DEC-*`
- risks: `RISK-*`
- open questions: `QUESTION-*`
- testing outcomes: `TEST-*`

Connect entities with `relates_to`, `validation`, and `validates` where supported. Every requirement must connect to a validation outcome or include an explicit `exception`. Add `evidence` only when an exact repository reference materially supports the statement.

## Visual content

Supply a concise text description for every diagram or visual surface.
Use structured native diagram data when simple nodes and edges are sufficient.
Use YAML block scalars such as `|-` for multiline Mermaid source or code.
Use Mermaid source only when it communicates the relationship more clearly.
Treat wireframes and prototypes as read-only review aids, not final production design.

## Generation

From the repository root:

```sh
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py \
  /path/to/prd-manifest.yaml
```

The generator validates the manifest, renders the bundle, preserves normalized YAML as `prd.yaml`, copies versioned assets, validates the staged output, and only then publishes the bundle directory.
