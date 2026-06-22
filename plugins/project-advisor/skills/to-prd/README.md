# Write a PRD

The `to-prd` skill turns a rough product idea into a validated, portable review bundle through an interview, repository grounding, JSON manifest authoring, deterministic generation, and human acceptance.

## Output

Each PRD is generated under:

```text
action-items/PRD-<slug>/
├── index.html
├── prd.json
└── assets/
    ├── app.js
    ├── project-advisor.svg
    └── styles.css
```

`prd.json` is the normalized planning source. `index.html` is the human review surface. The files under `assets/` are copied versioned generator assets, so the bundle can be moved or reviewed without installing the plugin.

## Workflow

1. Interview until the problem, users, scope, constraints, tradeoffs, and material uncertainty are clear.
2. Inspect the repository for terminology, current behavior, and durable constraints.
3. Select the initiative type, review surfaces, traceability relationships, and relevant blocks.
4. Write a JSON manifest; do not hand-author the generated HTML.
5. Run the standard-library-only `python3` generator.
6. Review structure, traceability, asset resolution, and other deterministic checks; leave rendered responsive, print, and accessibility judgment to the human reviewer unless a cheap preview exists.
7. Request human acceptance.
8. Offer issue splitting only after acceptance and only when the user requests the handoff.

The agent owns interviewing, repository analysis, content judgment, uncertainty, and block selection. The generator owns contract validation, escaping, canonical rendering, copied assets, structural output validation, and atomic publication.

## Generate a bundle

From the repository root:

```sh
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py \
  plugins/project-advisor/skills/to-prd/examples/basic-prd.json
```

This creates `action-items/PRD-example-review-bundle/`.

Options:

- `--output-root <directory>` changes the bundle parent.
- `--force` atomically replaces an existing bundle with the same slug after the new output validates.

No virtual environment, package installation, Node.js, Codex browser, or subagent capability is required. If no preview mechanism is available, provide the absolute `index.html` path and clearly identify visual checks still requiring human review.

## Contracts and fixtures

- `references/interview-map.md`: interview decision map
- `references/manifest-contract.md`: JSON and block-selection contract
- `references/review-checklist.md`: structural and visual acceptance checks
- `examples/basic-prd.json`: broad mixed-initiative example
- `evals/fixtures/*.json`: focused document, UI, workflow, API, data, and architecture fixtures
- `bundle/`: canonical HTML shell and versioned assets

## Test

```sh
cd plugins/project-advisor/skills/to-prd
python3 -m unittest discover tests 'test_prd_bundle_*.py'
```

PRDs are written in English.
