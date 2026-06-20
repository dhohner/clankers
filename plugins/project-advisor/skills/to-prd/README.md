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

Every generated PRD includes these sections:

- **Problem Statement** — the problem from the user's perspective
- **Solution** — the proposed approach
- **User Stories** — broad coverage across all relevant actors and scenarios
- **Implementation Decisions** — modules, interfaces, schema changes, API contracts
- **Testing Decisions** — what to test, how, and relevant prior art in the codebase
- **Out of Scope** — explicit boundaries
- **Further Notes** — assumptions, open questions, and rollout notes (populated only when there is material to include)

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
assets. Pass `--output-root <directory>` to choose another parent directory.
Existing bundles are preserved unless `--force` is supplied.

Manifest version 1 requires:

- `schema_version`, `slug`, `title`, `summary`, `status`, and string-valued `metadata`
- a problem statement with evidence
- goals with success signals
- users with needs and outcomes
- requirements, decisions, and validation outcomes
- explicit in-scope and out-of-scope lists
- rollout phases, risks with mitigations, and repository grounding

`sections.open_questions` is optional. When absent or empty, the generator omits
the section rather than leaving an empty heading or placeholder. Invalid JSON or
incomplete content exits non-zero and prints field-specific errors before any
bundle is published.

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
