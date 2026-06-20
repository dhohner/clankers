# Write a PRD

The to-prd skill turns a rough idea or partial brief into a reviewable Product Requirements Document. It combines a guided interview, repository grounding, and a bundled HTML renderer so the result can be reviewed in a browser without extra setup.

## What this skill does

The skill is designed for agent-driven PRD drafting. It helps the agent:

- capture what is already known from the conversation,
- inspect the repository for existing patterns, constraints, and terminology,
- ask focused follow-up questions to resolve the next important decision,
- draft a structured PRD with summary, status, metadata, and selected review blocks,
- and leave the output in a form that is easy to review and hand off later.

## How it works

The workflow is intentionally simple and iterative:

1. **Capture seed context** — extract what is already known before asking anything new.
2. **Ground the brief** — look at the repository for existing workflows, terminology, and constraints that matter to scope.
3. **Run the interview** — resolve the next decision that would most change the PRD and pressure-test ambiguous boundaries.
4. **Confirm the solution shape** — agree on the main capability areas, scope edges, and review surfaces.
5. **Draft the PRD** — generate a styled HTML document from the bundled template and references.
6. **Review loop** — check the rendered output, fix issues, and ask for approval before treating it as final.

## PRD structure

Every generated PRD includes a summary, status, and metadata. The rest of the document is assembled from a block catalog based on the initiative and the review surfaces that need human alignment. Omitted blocks are not rendered.

## Bundled references

The skill ships with the assets it needs to produce the PRD and its review experience:

- `references/interview-map.md` — decision clusters used to guide the interview
- `references/prd-template.html` — styled HTML layout, section structure, and writing guidance
- `references/review-checklist.md` — quality criteria applied before user review
- `bundle/assets/` — CSS, JavaScript, and SVG assets copied into generated bundles

## Standalone bundle generator

The generator is bundled with the skill and can be run directly from the skill directory. It uses only the Python 3 standard library and does not require a virtual environment, editable install, or packaging step.

From the repository root:

```sh
cd plugins/project-advisor/skills/to-prd
python3 -m scripts examples/basic-prd.json
```

This creates `action-items/PRD-example-review-bundle/index.html` and its local assets. The example manifest exercises the main review surfaces and rendering patterns, including the hero area, summary metrics, tables, requirements, diagrams, prototype states, timeline, risks, questions, grounding, and traceability. Use it as a visual regression fixture for generator changes.

You can choose a different output parent directory with `--output-root <directory>` and replace an existing bundle with `--force`.

## Skill layout

The current implementation is organized around a small Python package in `scripts/`:

- `scripts/__main__.py` — CLI entrypoint for the bundled generator
- `scripts/bundle.py` — writes the generated review bundle and copies assets
- `scripts/validation.py` — validates and normalizes the manifest
- `scripts/rendering.py` and `scripts/render_*.py` — render the HTML output
- `tests/` — focused CLI, rendering, validation, and asset tests
- `examples/basic-prd.json` — example manifest used for local verification

## Manifest basics

The generator expects a manifest that follows the current schema version. At minimum, it requires:

- `schema_version`, `slug`, `title`, `summary`, `status`, and string-valued `metadata`
- an `initiative_type` from the supported catalog
- one or more `review_surfaces`
- a non-empty `blocks` object containing only supported blocks

The validator rejects invalid block names or content shapes before any bundle is published.

## Validation and testing

From the skill root, run the focused suite with:

```sh
python3 -m unittest discover \
  tests \
  'test_prd_bundle_*.py'
```

## Example prompts

```text
"Write a PRD for this new feature"
"Help me plan this — let's do a PRD"
"I need a product requirements document for X"
```

Once the PRD is approved, the skill can offer to hand it off to the `to-issues` skill to break it into Jira-ready work items.

## Language

PRDs are always written in English.

## Author

Daniel Hohner
