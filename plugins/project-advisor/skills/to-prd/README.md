# Write a PRD

The `to-prd` skill turns a product idea or PRD review note into a validated local review bundle.
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

`prd.yaml` is the normalized planning source and records the interview design tree beside the decisions.
`index.html` is the human review surface.
The bundle copies its assets, including two OFL-licensed fonts and their license texts.
A reviewer therefore needs no plugin and sees identical typography on every machine.

The bundle is a screen artifact and does not support printing.
Diagrams load Mermaid from `cdn.jsdelivr.net` at review time and fall back to their text source without a network.

## Workflow

`SKILL.md` holds the loop: ground the decision, author the manifest, publish and inspect, hold the review gate.
Acceptance sets `status: Accepted` in the published `prd.yaml`, which `to-issues` and `to-agent-tasks` read.
Review feedback on an existing PRD re-enters the loop as a revision of a scratch copy of `prd.yaml`.
[references/manifest-contract.md](references/manifest-contract.md) describes the manifest versions and the rules the CLI does not print.

## CLI

From the repository root, publish a bundle with:

```sh
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py validate plugins/project-advisor/skills/to-prd/examples/minimal-prd.yaml
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py generate plugins/project-advisor/skills/to-prd/examples/minimal-prd.yaml
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py inspect action-items/PRD-minimal-prd/
```

Commands:

- `status`: workspace dashboard and the no-argument default.
- `schema [block ...]`: manifest fields, supported blocks, and block examples.
- `template --blocks <block ...>`: valid placeholder manifest for the selected blocks.
- `examples [name]`: bundled manifest examples.
- `validate <prd.yaml>`: validate without writing.
- `generate <prd.yaml>`: generate after validation.
- `inspect <bundle-dir>`: summarize generated structure, assets, anchors, traceability, and validation.

Options:

- `--output-root <directory>` changes the bundle parent for `status` and `generate`.
- `--force` replaces an existing bundle with the same slug after the new output validates.
- `--format yaml|text` selects the output format, and non-template commands default to YAML.
- `--full` expands large `validate` and `inspect` output.

The CLI needs Python 3.14 or newer, without a virtual environment, package installation, Node.js, or browser.

## References

- `references/manifest-contract.md`: manifest versions and rules the CLI schema does not print.
- `references/review-checklist.md`: full bundle checklist when inspection is insufficient.
- `examples/minimal-prd.yaml`: smallest valid manifest.
- `examples/basic-prd.yaml`: broad mixed-initiative example.
- `examples/fixtures/*.yaml`: focused examples by initiative type.
- `bundle/`: canonical HTML shell and versioned assets.
- `evals/`: regression prompts and expectations.

## Test

```sh
cd plugins/project-advisor/skills/to-prd
python3 -m unittest discover tests 'test_prd_bundle_*.py'
```

Lint and format the CLI with [ruff](https://docs.astral.sh/ruff/), configured in `ruff.toml`:

```sh
cd plugins/project-advisor/skills/to-prd
uvx ruff check .
uvx ruff format --check .
```

Ruff is a development tool only, so the CLI still runs with a bare `python3`.
