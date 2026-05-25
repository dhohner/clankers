# CRAP Plugin

Provides a report-only workflow for CRAP: Change Risk Anti Patterns analysis, with optional local metrics inspired by the original CRAP metric paper.

## What It Does

The included `analyze-crap` skill reviews a codebase, changed files, or a user-specified area for patterns that increase the risk of future changes. It focuses on:

- Code that is hard to change safely
- Hidden coupling and unclear ownership boundaries
- Tests, observability, and rollout gaps
- Fragile dependencies, implicit contracts, and migration risks
- Concrete mitigations ranked by severity and effort

## Usage

```text
"Run a CRAP analysis on this repository"
"Analyze my staged changes for Change Risk Anti Patterns"
"Before I refactor this module, identify the risky parts"
```

The agent returns a structured report. It does not edit code unless the user separately asks for implementation work.

## Optional Complexity Graph

For a metrics-backed starting point, run the companion script locally:

```bash
python plugins/crap/scripts/crap-complexity-graph.py . --format markdown              # changed code only by default
python plugins/crap/scripts/crap-complexity-graph.py . --all --format dot > crap-complexity.dot
python plugins/crap/scripts/crap-complexity-graph.py . --coverage coverage/coverage-summary.json --format json
python plugins/crap/scripts/crap-complexity-graph.py . --format sarif --output crap.sarif --fail-on high
```

The script is dependency-free and estimates file-level cyclomatic complexity, import edges, optional coverage, and a CRAP score using the Artima formula. It uses standard local git commands to analyze only locally changed code by default; pass `--all` for a full selected-root scan.

```text
CRAP = complexity^2 * (1 - coverage)^3 + complexity
```

Use the output as evidence, not as the whole review: high complexity is a routing signal for where the skill should inspect ownership, coupling, test quality, migration risk, and release risk.

### Enterprise Usage

The companion script is designed to run in local review, CI, and code-scanning workflows without additional dependencies:

- `--format json` emits a stable summary plus per-file metrics for dashboards and build annotations.
- `--format sarif --output crap.sarif` emits SARIF 2.1.0 for GitHub code scanning and compatible enterprise tooling.
- `--fail-on medium|high` turns the scan into a CI gate.
- `--medium-complexity`, `--high-complexity`, `--medium-score`, and `--high-score` tune risk thresholds per organization.
- `--base-ref <ref>` compares changed files against a release branch or merge base instead of `HEAD`.
- `--exclude <glob>`, `--ignore-dir <name>`, `--max-file-size <bytes>`, and generated-file defaults keep monorepo scans bounded.
- `--workers <n>` opts into process-based parallel file analysis for large repositories; the default is single-process to avoid overhead on normal local scans.

## Learn More

Current bundled skill:

- `analyze-crap`

See [the skill definition](./skills/analyze-crap/SKILL.md) for the full workflow and report format.

## Authors

[dhohner](https://github.com/dhohner)
