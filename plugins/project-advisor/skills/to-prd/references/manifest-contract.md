# PRD Manifest Contract

Create YAML that the bundled `python3` generator can validate and render. Use [../examples/basic-prd.yaml](../examples/basic-prd.yaml) for a full example and `evals/fixtures/` for focused initiative examples.

## Required top-level fields

- `schema_version`: `1`
- `slug`: lowercase kebab-case; output becomes `action-items/PRD-<slug>/`
- `title`, `summary`, `status`: non-empty strings
- `initiative_type`: `small-feature`, `ui-heavy`, `workflow-heavy`, `api-heavy`, `data-heavy`, `architecture-heavy`, or `mixed`
- `review_surfaces`: one or more of `document`, `ui`, `workflow`, `api`, `data`, and `architecture`; include `document`, include the matching surface for `*-heavy` initiatives, and use at least two non-document surfaces for `mixed`
- `metadata`: string-valued labels; do not set generated labels such as `Initiative`, `Review surfaces`, or `Output`
- `blocks`: a non-empty mapping containing only supported block names

## Language

Write all user-visible manifest text in English: `title`, `summary`, `status`, `metadata`, block content, table labels, diagram descriptions, wireframe labels, and Mermaid labels.
Translate German user input, comments, and documentation into natural English planning language.
Keep German only when it is an exact repository-backed code identifier, file name, API name, product label, or domain idiom.
When a German phrase is kept for that reason, attach the relevant repository evidence where the field supports `evidence`; otherwise keep it visibly quoted as repository terminology.
Do not write mixed German prose with English headings.

## Block selection

Select blocks because they improve a product decision, not to fill a template.

- Document-only: problem, goals, scope, requirements, decisions, risks, testing, and open questions as needed.
- UI: wireframes, annotated screens, UI flow, and design direction when visual state alignment matters.
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
Treat wireframes and annotated screens as read-only review aids, not final production design.

### Mermaid authoring

Prefer Mermaid for branches, loops, boundaries, lifecycle states, or cross-system flows that native nodes and edges cannot express clearly.
Make each diagram answer one review question, such as where acceptance gates issue handoff or where sensitive data crosses a boundary.
Keep diagrams small: 6 to 10 visible nodes, meaningful node labels, and short edge labels.
Show failure, fallback, and decision paths when they affect scope or acceptance.
Use `subgraph` blocks to show product, runtime, repository, generated artifact, or external-service boundaries.
Reference stable PRD IDs on important edges only when it improves traceability, for example `|TEST-04 verifies REQ-04|`.
Avoid decorative styling, custom classes, icons, and clever Mermaid features that make the source fallback harder to read.
If the source becomes dense, split the content into a smaller diagram plus prose, a table, or native diagram data.

## Generation

From the repository root:

```sh
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py validate \
  /path/to/prd-manifest.yaml
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py generate \
  /path/to/prd-manifest.yaml
```

The CLI emits structured YAML by default.
The generator validates the manifest, renders the bundle, preserves normalized YAML as `prd.yaml`, copies versioned assets, validates the staged output, and only then publishes the bundle directory.
