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

## Optional Complexity and Call Graph Scripts

The plugin includes two dependency-free local scripts. Use them as evidence generators for the CRAP review, not as the whole review: high complexity and dense call chains are routing signals for where the skill should inspect ownership, coupling, test quality, migration risk, and release risk.

### `crap-complexity-graph.py`: main multi-language entry point

Use this script for file-level complexity, import/dependency edges, optional coverage, CRAP scores, SARIF output, and CI gating.

```bash
python plugins/crap/scripts/crap-complexity-graph.py . --format markdown              # changed code only by default
python plugins/crap/scripts/crap-complexity-graph.py . --all --format dot > crap-complexity.dot
python plugins/crap/scripts/crap-complexity-graph.py . --coverage coverage/coverage-summary.json --format json
python plugins/crap/scripts/crap-complexity-graph.py . --format sarif --output crap.sarif --fail-on high
```

Primary use cases:

- Find complex files touched by local changes before review.
- Generate a repository-wide file dependency graph.
- Combine file complexity with coverage to compute CRAP risk.
- Emit JSON for dashboards or SARIF for code scanning.
- Fail CI when changed or scanned code crosses configured risk thresholds.

The CRAP score uses the Artima formula:

```text
CRAP = complexity^2 * (1 - coverage)^3 + complexity
```

The main script also acts as the dispatcher for language-specific symbol graphs. For Java method call-chain analysis, run it with `--graph-level symbol`; it detects Java files and delegates to the Java call graph CLI at `plugins/crap/scripts/java/cli.py`.

```bash
python plugins/crap/scripts/crap-complexity-graph.py . \
  --graph-level symbol \
  --direction both \
  --depth 8 \
  --format dot \
  --output java-call-chain.dot
```

### `scripts/java/cli.py`: Java method call-chain helper

Use this script directly when you specifically want Java method-level call chains. The Java implementation is split into focused modules under `plugins/crap/scripts/java/` for maintainability (`scanner`, `parser`, `graph`, `render`, and `cli`). It is optimized for common Spring-style flows such as:

```text
Controller.method -> Service.method -> Repository.method -> external:jpa-repository
```

```bash
python plugins/crap/scripts/java/cli.py . --format markdown
python plugins/crap/scripts/java/cli.py . --all --format dot > java-callgraph.dot
python plugins/crap/scripts/java/cli.py . --direction both --depth 8 --format json
python plugins/crap/scripts/java/cli.py . --format agent --include-snippets --output callgraph-context.md
python plugins/crap/scripts/java/cli.py . --project-package com.example.demo --edge-scope project --format json
```

Primary use cases:

- Start from changed Java methods and show callers, callees, or both.
- Visualize Controller → Service → Repository paths affected by a change.
- Stop traversal at likely external-system boundaries such as JPA repositories, JDBC, `EntityManager`, `JdbcTemplate`, raw SQL, HTTP clients, queues, caches, and object storage clients.
- Produce method-level DOT graphs for PR review or architecture inspection.
- Produce AI-agent context with `--format agent`, including changed methods, affected chains, external boundaries, risky/ambiguous symbols, recommended inspection order, and optional bounded source snippets.
- Resolve receiver types through package/import metadata so application edges stay focused on project classes instead of JDK/framework helper calls. Use `--project-package` to override auto-detected package roots and `--edge-scope project|resolved|all` to control whether external/library calls are hidden or shown.
- Exclude test classes by default to keep runtime production call paths clean; pass `--include-tests` when tests should be part of the graph.
- Inspect the full Java symbol graph with `--all`.

The Java JSON output is intentionally agent-oriented and may differ from older versions. It includes `changedRoots`, `chains`, enriched `symbols`, confidence-bearing `edges`, `boundaries`, and `riskyOrAmbiguousSymbols` so downstream tools do not have to infer review semantics from raw graph edges.

Important limitation: the Java call graph parser is zero-dependency and heuristic, not a Java compiler or type checker. It works best for conventional Java/Spring code with clear field, constructor, parameter, and local variable types. It may miss overloaded, reflection-heavy, generated, framework-wired, or highly dynamic call paths.

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
