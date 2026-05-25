---
name: analyze-crap
description: Produce a structured CRAP (Change Risk Anti Patterns) analysis for a repository, diff, staged change, module, planned refactor, migration, or user-specified code area. Use this skill whenever the user asks whether a change is safe, what could break, where coupling or verification gaps are hiding, how risky a refactor or migration will be, or wants a grounded risk report before touching code, even if they never say "CRAP." This is report-only by default; do not edit files unless the user explicitly asks for mitigations to be implemented after the report.
---

# Analyze Change Risk Anti Patterns

CRAP means **Change Risk Anti Patterns** here: codebase conditions that make future changes likely to break behavior, spread across too many owners, require brittle coordination, or be hard to verify.

This skill is report-only by default. Do not edit files, stage changes, commit, push, contact remotes, or run destructive commands unless the user separately asks for implementation after the report.

Use repository evidence over generic advice. Every finding must cite files, symbols, diffs, tests, configs, scripts, or observed project behavior. Prefer a short, actionable report over a broad tour.

## Default Scope

Choose the narrowest scope that answers the request.

- No explicit scope: analyze locally changed code.
- Staged/diff/commit request: analyze that change set first.
- File, directory, module, migration, or planned refactor: analyze the named surface plus nearest callers, callees, tests, configs, and contracts.
- Repo-level request: sample bounded high-signal surfaces, especially manifests, build/test/CI config, public entrypoints, exports, recent churn, and nearest tests.
- Repo-level plugin or monorepo hardening request: start with plugin inventories, marketplace/registry files, installers, validators, and per-plugin manifests before reading plugin internals.

If a staged-change request has no staged files, say so and ask for a different scope. If there are no local changes for an unspecific request, say so and ask whether to analyze a branch diff, path, commit, or the whole repo.

## Companion Script

Run or recommend `plugins/crap/scripts/crap-complexity-graph.py` early when analyzing code. Treat its metrics as routing evidence, not a verdict.

Default changed-code scan:

```bash
python plugins/crap/scripts/crap-complexity-graph.py . --format markdown
```

Use these options when the request calls for them:

- `--all`: only for explicit repo/module-wide scans.
- `--coverage <path>`: when a coverage artifact is known; otherwise allow auto-detection.
- `--format json`: when machine-readable evidence helps summarize or compare results.
- `--format sarif --output crap.sarif`: for CI/code-scanning workflows.
- `--fail-on medium|high`: only when the user asks for a gate or policy check.
- `--base-ref <ref>`: for branch/release comparisons when the ref is already local or supplied by the user.
- `--exclude <glob>`, `--ignore-dir <name>`, `--max-file-size <bytes>`: for large repos, generated outputs, vendored code, or noisy paths.
- `--workers <n>`: only for large scans where process overhead is justified; default single-process is usually right for local use.

Interpretation rules:

- High CRAP or complexity identifies code to inspect for concrete coupling, ownership, verification, migration, or release risk.
- Low CRAP does not prove safety.
- Do not report complexity alone unless it creates a plausible change failure mode.
- If coverage is missing or unmapped, call the script result complexity-only.

## Evidence Workflow

1. State the working scope and inferred change intent.
2. Inspect project rules if present: `AGENTS.md`, `.github/copilot-instructions.md`, `CLAUDE.md`, `.cursorrules`.
3. Check local git state for changed, staged, or requested diff context.
4. Identify the build and test strategy from manifests, test folders, config, and CI.
5. Run or cite the companion script for code scans, then inspect the highest-signal files it surfaces.
6. Read only enough supporting code to prove or disprove risks: direct callers, callees, consumers, tests, configs, public contracts, storage/API boundaries, and rollout paths.
7. Stop when you have 3-5 strong findings, or 5-8 only for explicitly broad audits with genuinely distinct risks.

Avoid generated files, lockfiles, vendored dependencies, build outputs, and `node_modules` unless they are the requested risk surface.

## Risk Categories

Evaluate findings against these categories:

- Coupling and blast radius: coordinated edits, hidden bidirectional dependencies, global state/config, unclear public API compatibility, scattered feature logic.
- Complexity and coverage hotspots: high complexity plus weak/absent focused coverage, many branches, high churn, unclear ownership, high CRAP score.
- Regression surface: critical behavior without semantic tests, brittle snapshots, mocked-away integration points, undocumented manual QA.
- Ambiguous ownership: modules mixing policy, orchestration, side effects, persistence, presentation, or lifecycle rules.
- Data and migration risk: schema/storage/serialization/API changes, backward compatibility, cache invalidation, retries, idempotency, rollback.
- Operational and release risk: missing flags, rollout/kill-switch paths, observability gaps, swallowed errors, fragile runtime config.
- Dependency and platform risk: breaking dependency/API exposure, bypassed framework conventions, environment assumptions, local/CI/deploy drift.

## Valid Findings

A finding is valid only if it includes:

- concrete evidence tied to repository artifacts
- a plausible future change scenario or failure mode
- why current coupling, ownership, verification, migration, or release shape makes that change risky
- one concrete mitigation that reduces the risk

Merge findings that share the same first mitigation. Put thin evidence, assumptions, and uninspected areas in `NOTES AND LIMITS` instead of forcing weak findings.

## Severity

- `Critical`: direct evidence suggests production-impacting failure, data loss, security exposure, or blocked release if this area changes.
- `High`: the next normal change is likely to cause regressions, wide coordinated edits, or expensive rework.
- `Medium`: plausible but contained risk, or moderate verification/ownership gap.
- `Low`: real but localized risk usually manageable with a small mitigation.

Also assign `Likelihood`, `Impact`, `Confidence`, and `Mitigation Effort` as `high`, `medium`, or `low`; effort may be `small`, `medium`, or `large`. Do not use `Critical` without direct evidence of serious impact.

## Report Format

Return exactly this structure for material findings:

```md
**CRAP ANALYSIS**

- Scope: `<repo | staged changes | commit/range | path(s) | described feature>`
- Change intent: `<user intent | inferred intent | unknown>`
- Risk posture: `<production-critical | internal | experimental | unknown>`
- Evidence reviewed: `<files, configs, tests, commands, or sampling notes>`
- Project rules: `<filename | none found>`

**EXECUTIVE SUMMARY**

- Overall risk: Critical | High | Medium | Low
- Highest-risk area: `<path or subsystem>`
- Main risk driver: `<one sentence>`
- Recommended first move: `<one concrete action>`

**FINDINGS**

1. `[Severity]` Finding title
   - Category: `<category>`
   - Evidence: `<specific files, symbols, tests, commands, metrics, or diffs>`
   - Why it matters: `<risk explanation>`
   - Likelihood: high | medium | low
   - Impact: high | medium | low
   - Confidence: high | medium | low
   - Mitigation effort: small | medium | large
   - Recommendation: `<concrete mitigation>`

**RISK MATRIX**

| Area | Severity | Likelihood | Impact | Confidence | Mitigation Effort |
| --- | --- | --- | --- | --- | --- |
| `<path/subsystem>` | High | medium | high | high | medium |

**SAFE NEXT STEPS**

1. `<highest leverage mitigation>`
2. `<next mitigation>`
3. `<verification or rollout step>`

**NOTES AND LIMITS**

- `<scope limitations, missing context, assumptions, missing coverage, or uninspected tests>`
```

If no material Change Risk Anti Patterns are found:

```md
**CRAP ANALYSIS**

- Scope: `<scope>`
- Evidence reviewed: `<brief evidence>`

No material Change Risk Anti Patterns found in the selected scope.

**NOTES AND LIMITS**

- `<remaining uncertainty, if any>`
```

## Quality Bar

- Findings first, strongest first.
- Prefer 3-5 specific findings over a long list.
- Name the boundary to extract when recommending refactors.
- Name the behavior or integration to verify when recommending tests.
- Make `Recommended first move` the smallest action that freezes the controlling contract or verification boundary.
- Keep recommendations scoped to reducing change risk, not broad cleanup.
