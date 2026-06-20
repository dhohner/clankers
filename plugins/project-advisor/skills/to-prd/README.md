# Write a PRD

Turns a rough idea or partial brief into a structured Product Requirements Document through a focused interview, codebase exploration, and shared-understanding pass, then saves it as a styled HTML PRD file that is easy to review in a browser.

## How it works

The skill treats the interview as the main work. It keeps separate buckets for confirmed decisions, provisional assumptions, and open questions so the PRD can move forward without pretending uncertain details are settled. It uses code and domain docs to sharpen the brief, but keeps the PRD as the main deliverable. Only then does it write.

1. **Capture seed context** — extracts what is already known from the conversation before asking anything new
2. **Explore the codebase** — verifies existing patterns, naming, domain documentation, durable decisions, and constraints that the brief may not mention
3. **Run the interview** — resolves the next decision that would most change the PRD, challenges ambiguous terminology against docs and code, and pressure-tests fuzzy boundaries with concrete scenarios
4. **Confirm the solution shape** — proposes the major capability areas, scope edges, and testing intent, then confirms them with the user
5. **Draft the PRD** — produces a styled HTML document from the bundled template
6. **Review loop** — self-reviews inline, runs a reviewer subagent when available, opens or previews the generated HTML PRD for the user when the environment supports it, then asks the user to accept or request changes

## PRD structure

Every generated PRD includes a summary, status, and metadata. The remaining
document structure is selected from the block catalog according to the
initiative and the review surfaces that need human alignment. Omitted blocks
are not rendered.

## Bundled references

- `references/interview-map.md` — decision clusters used to guide the interview
- `references/prd-template.html` — styled HTML layout, section structure, and writing guidance
- `references/review-checklist.md` — quality criteria applied before user review

## Basic JSON bundle generator

The first bundle generator is available independently of any coding-agent harness.
It uses only the Python 3 standard library and copies its CSS, JavaScript, and SVG
assets from versioned files in `bundle/assets/`.

From the repository root:

```sh
python3 plugins/project-advisor/skills/to-prd/scripts/generate_prd.py \
  plugins/project-advisor/skills/to-prd/examples/basic-prd.json
```

This creates `action-items/PRD-example-review-bundle/index.html` and its local
assets. The example intentionally exercises the reference-aligned hero,
summary metrics, flat content grids, tables, requirements, diagrams, prototype
states, timeline, risks, questions, grounding, and traceability. Use it as the
visual regression fixture for generator changes. Pass `--output-root
<directory>` to choose another parent directory. Existing bundles are
preserved unless `--force` is supplied.

Manifest version 1 requires:

- `schema_version`, `slug`, `title`, `summary`, `status`, and string-valued `metadata`
- `initiative_type`: `ui-heavy`, `workflow-heavy`, `api-heavy`, `data-heavy`,
  `architecture-heavy`, `mixed`, or `small-feature`
- one or more `review_surfaces`: `document`, `workflow`, `ui`, `api`, `data`, or
  `architecture`
- a non-empty `blocks` object containing only the review blocks useful for the
  initiative

The block catalog spans framing, people and workflow, product definition,
visual experience, technical contracts, and delivery and assurance. Blocks are
rendered in stable catalog order regardless of JSON key order. Omitted blocks
leave no heading, navigation item, card, or placeholder. Invalid block names or
content shapes exit non-zero with field-specific errors before any bundle is
published.

### Visual review blocks

Diagram blocks accept either Mermaid `source` or a structured `native` graph.
Mermaid is loaded progressively from the jsDelivr Mermaid 11 ESM distribution;
the description and escaped source remain visible if loading or rendering
fails. Native graphs render locally as HTML and SVG without an editor or agent
API:

```json
{
  "description": "A request moves through the gateway to the service.",
  "native": {
    "nodes": [
      {"id": "client", "label": "Client"},
      {"id": "gateway", "label": "Gateway"},
      {"id": "service", "label": "Service"}
    ],
    "edges": [
      {"from": "client", "to": "gateway", "label": "HTTPS"},
      {"from": "gateway", "to": "service", "label": "Route"}
    ]
  }
}
```

`wireframes` and `annotated_screens` accept optional structured `regions` on
each screen. `prototype` accepts a description and named states with optional
label/value content. Generated state controls are keyboard-operable,
read-only, do not persist data, and expand all states for print:

```json
{
  "description": "Review behavior across the main approval states.",
  "states": [
    {
      "label": "Ready",
      "behavior": "The reviewer can inspect the proposed change.",
      "content": [{"label": "Status", "value": "Ready for review"}]
    },
    {
      "label": "Blocked",
      "behavior": "The unresolved dependency and next action are visible.",
      "content": [{"label": "Status", "value": "Needs input"}]
    }
  ]
}
```

## Usage

```text
"Write a PRD for this new feature"
"Help me plan this — let's do a PRD"
"I need a product requirements document for X"
```

Once the PRD is approved, the skill offers to hand it off to the `to-issues` skill to break it into Jira-ready work items.

## Language

PRDs are always written in English.

## Author

Daniel Hohner
