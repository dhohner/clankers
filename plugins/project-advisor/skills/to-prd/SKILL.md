---
name: to-prd
description: "Use when the user asks for a PRD, feature spec, requirements doc, planning brief, scope, acceptance criteria, risks, or review feedback on an existing PRD. Turn concrete product decisions into a repo-grounded English PRD bundle, validate it, and stop for review before issue splitting."
---

# Write a PRD

Product judgment is the job.
Run the shortest loop that works: discover, draft, validate, stop for human review.

## Existing PRD first

Use this path when the user provides `prd.yaml`, an `action-items/PRD-*` bundle, or feedback on a generated PRD.

1. Read the existing `prd.yaml`.
2. Clarify only ambiguous feedback.
3. Edit the smallest YAML paths that satisfy the request.
4. Preserve unrelated text, ordering, initiative type, review surfaces, and stable IDs unless asked to change them.
5. Regenerate with `--force`, validate, inspect, and reopen for review.

Rewrite the full manifest only for a new PRD, a broad initiative-shape change, or YAML that cannot be repaired safely.

## Rules

- Do not guess decisions that materially change scope, behavior, rollout, risk, or issue decomposition.
- Track `Confirmed`, `Provisional`, and `Open` while interviewing.
- Ask at most 4 focused questions per round unless the user wants a broad intake.
- Inspect the repo early for terminology, current behavior, and durable constraints unless irrelevant.
- Write user-visible PRD text in English.
- Preserve German only for exact repo-backed identifiers, filenames, API names, product labels, or domain idioms.
- Do not split into issues until the user accepts the PRD or explicitly requests a PRD-to-issues flow.

## 1. Discover

Extract what is already known: problem, users, outcome, constraints, non-goals, uncertainty, and likely review surfaces.
Read [./references/interview-map.md](./references/interview-map.md) only when the request is vague, the interview stalls, or a broader decision map is needed.

Ask the question whose answer would most change the PRD.
After each round, summarize short `Confirmed`, `Provisional`, and `Open` bullets, then numbered `Questions`.

Draft once you can describe capability areas, scope boundaries, key workflows, failure paths, fallback behavior, risks, validation needs, and review surfaces.
Leave remaining non-blocking uncertainty as assumptions or open questions.

## 2. Author YAML

`prd.yaml` is the source of truth.
Do not hand-author `index.html`.

Prefer CLI output over loading docs:

```sh
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py schema
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py schema <block> [block ...]
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py template --blocks <block> [block ...]
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py examples minimal-prd
```

Before authoring, run `schema` with no args, choose `initiative_type`, then copy the required surfaces from `required_review_surfaces_by_initiative`.
Do not hand-pick `review_surfaces` from memory; every initiative includes `document`, each `*-heavy` type also includes its matching surface, and `mixed` needs at least two non-document surfaces.
After selecting blocks, run one multi-block `schema` call before writing YAML content.
Follow `field_shapes`: `evidence`, `relates_to`, `validation`, and `validates` are arrays of strings, even for one item.
For native diagrams, every node and edge label must be a meaningful non-empty string; do not use `label: ""`.
Use `template --blocks` for new manifests once the useful blocks are known, then replace placeholders with product content.
Use multi-block `schema` instead of one call per block when you need several formats; each block schema includes an example fragment.
Use `examples/minimal-prd.yaml` for the smallest valid manifest skeleton.
Use `evals/fixtures/` for focused surface examples.
Use `examples/basic-prd.yaml` only for broad mixed initiatives.
Read [./references/manifest-contract.md](./references/manifest-contract.md) only when schema, fixtures, or validation output are insufficient.

Create the manifest in a temporary or non-colliding path.
Select initiative type, review surfaces, and blocks because they improve review quality, not to fill a template.
Use stable IDs for requirements, decisions, risks, questions, and tests.
Connect every requirement to validation outcomes or an explicit exception.
Add repository evidence only when it materially supports a product statement.

Use visuals only when they clarify workflow, state, boundary, contract, or data better than prose.
Prefer native node-edge data for simple diagrams and small Mermaid diagrams for branches, loops, boundaries, lifecycle states, or cross-system flows.

## 3. Generate and validate

From the repo root:

```sh
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py validate /path/to/prd.yaml
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py generate /path/to/prd.yaml
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py inspect action-items/PRD-<slug>/
```

Use `--output-root` only when needed and `--force` only for intentional replacement.
If `python3` is unavailable, report the block and preserve the manifest.
Never recreate the bundle by hand.

Before review, validation and inspection must pass, local assets must exist, fragment links must resolve, requirement traceability must hold, and English-only prose must remain intact.
Read [./references/review-checklist.md](./references/review-checklist.md) only when inspection fails, the bundle is unusual, or the full checklist is needed.
Leave responsive, print, and rendered accessibility judgment to the human reviewer unless preview is cheap.

Fix issues in YAML, regenerate, and inspect again.
Delete scratch manifests after success.
Keep `action-items/PRD-<slug>/prd.yaml` beside `index.html`.

## 4. Review and handoff

Open the bundle when possible:

```sh
open action-items/PRD-<slug>/index.html
```

If opening is unavailable, provide the absolute `index.html` path and name visual checks left for review.
Ask the user to accept or request changes.
After acceptance, offer `to-issues` and pass the accepted `prd.yaml` as the planning source.
