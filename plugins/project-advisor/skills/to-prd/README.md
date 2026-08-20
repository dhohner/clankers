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
    ├── favicon.svg
    ├── styles.css
    └── fonts/
```

`prd.yaml` is the normalized planning source.
Version 2 requires it to publish the interview design tree beside the decisions.
`index.html` is the human review surface.
Assets are copied into the bundle so it can be reviewed without installing the plugin, including the two OFL-licensed faces and their license texts, so typography is identical on every machine.

The bundle is a screen artifact and does not support printing.
Diagrams load Mermaid from `cdn.jsdelivr.net` at review time and fall back to a readable text source when there is no network.

## Manifest versions

`schema_version` names the contract a manifest follows.
No other rule differs between the two accepted versions.

- Version 2 is the current contract and requires the `design_tree` block.
- Version 1 stays valid for a manifest published before the tree existed and keeps the tree optional.
- `template` emits version 2 with a tree placeholder, and `generate` copies the version the source manifest declares.
- `validate`, `generate`, and `inspect` report the applied version as `manifest_version`.

## Workflow

`SKILL.md` holds the authoritative loop: ground the decision, author the working manifest, publish and inspect, apply the review gate.
The gate matters outside the chat: acceptance sets `status: Accepted` in the published `prd.yaml`, which is what `to-issues` and `to-agent-tasks` read.
Review feedback on an existing PRD re-enters the loop as a revision from a scratch copy of `prd.yaml`.

## CLI

From the repository root, publish a bundle with:

```sh
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py validate plugins/project-advisor/skills/to-prd/examples/minimal-prd.yaml
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py generate plugins/project-advisor/skills/to-prd/examples/minimal-prd.yaml
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py inspect action-items/PRD-minimal-prd/
```

Useful commands:

- `status`: workspace dashboard and no-argument default.
- `schema [block ...]`: manifest fields, supported blocks, and block examples.
- `template --blocks <block ...>`: valid placeholder manifest for selected blocks.
- `examples [name]`: bundled manifest examples.
- `validate <prd.yaml>`: validate without writing.
- `generate <prd.yaml>`: generate after validation.
- `inspect <bundle-dir>`: summarize generated structure, assets, anchors, traceability, and validation.

Useful options:

- `--output-root <directory>` changes the bundle parent for `status` and `generate`.
- `--force` replaces an existing bundle with the same slug after the new output validates.
- `--format yaml|text` defaults to structured YAML for non-template commands.
- `--full` expands large `validate` and `inspect` output.

No virtual environment, package installation, Node.js, or browser is required.
Sub-agents are used for environment fact-finding during the interview when the harness provides them, and the skill explores directly when it does not.
If no preview mechanism is available, provide the absolute `index.html` path and name visual checks left for human review.

## References

- `references/manifest-contract.md`: optional contract notes when CLI schema is insufficient.
- `references/review-checklist.md`: optional full checklist when inspection is insufficient.
- `examples/minimal-prd.yaml`: tiny valid syntax example.
- `examples/basic-prd.yaml`: broad mixed-initiative example.
- `examples/fixtures/*.yaml`: focused examples by initiative type.
- `bundle/`: canonical HTML shell and versioned assets.
- `evals/`: regression prompts and expectations.

## Test

```sh
cd plugins/project-advisor/skills/to-prd
python3 -m unittest discover tests 'test_prd_bundle_*.py'
```
