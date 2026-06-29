# Write a PRD

The `to-prd` skill turns a rough product idea or PRD review note into a validated local review bundle.
The agent owns product judgment, repository grounding, uncertainty, and block selection.
The generator owns schema validation, escaping, canonical rendering, asset copying, structural validation, and atomic publication.

## Output

```text
action-items/PRD-<slug>/
├── index.html
├── prd.yaml
└── assets/
    ├── app.js
    └── styles.css
```

`prd.yaml` is the normalized planning source.
`index.html` is the human review surface.
Assets are copied into the bundle so it can be reviewed without installing the plugin.

## Workflow

1. Interview only until material product decisions are concrete or safely labeled open.
2. Inspect the repository for terminology, current behavior, and durable constraints.
3. Choose the initiative type, review surfaces, traceability, and useful blocks.
4. Write YAML and generate the bundle.
5. Validate and inspect the bundle.
6. Request human acceptance.
7. Offer issue splitting only after acceptance or when the user explicitly asks for the handoff.

For review feedback on an existing PRD, edit `prd.yaml` directly, preserve stable IDs and unrelated content, regenerate with `--force`, and request review again.

## CLI

From the repository root:

```sh
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py status
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py schema
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py schema requirements
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py examples minimal-prd
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py validate plugins/project-advisor/skills/to-prd/examples/minimal-prd.yaml
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py generate plugins/project-advisor/skills/to-prd/examples/minimal-prd.yaml
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py inspect action-items/PRD-minimal-prd/
```

Useful commands:

- `status`: workspace dashboard and no-argument default.
- `schema [block]`: manifest fields and supported blocks.
- `examples [name]`: bundled manifest examples.
- `validate <prd.yaml>`: validate without writing.
- `generate <prd.yaml>`: generate after validation.
- `inspect <bundle-dir>`: summarize generated structure, assets, anchors, traceability, and validation.

Useful options:

- `--output-root <directory>` changes the bundle parent for `status` and `generate`.
- `--force` replaces an existing bundle with the same slug after the new output validates.
- `--format yaml|text` defaults to structured YAML.
- `--full` expands large `validate` and `inspect` output.

No virtual environment, package installation, Node.js, browser, or subagent capability is required.
If no preview mechanism is available, provide the absolute `index.html` path and name visual checks left for human review.

## References

- `references/interview-map.md`: optional decision map for vague or stuck interviews.
- `references/manifest-contract.md`: optional contract notes when CLI schema is insufficient.
- `references/review-checklist.md`: optional full checklist when inspection is insufficient.
- `examples/minimal-prd.yaml`: tiny valid syntax example.
- `examples/basic-prd.yaml`: broad mixed-initiative example.
- `evals/fixtures/*.yaml`: focused examples by initiative type.
- `bundle/`: canonical HTML shell and versioned assets.

## Test

```sh
cd plugins/project-advisor/skills/to-prd
python3 -m unittest discover tests 'test_prd_bundle_*.py'
```
