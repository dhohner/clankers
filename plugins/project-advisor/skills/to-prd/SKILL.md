---
name: to-prd
description: "Use when the user asks for a PRD, feature spec, requirements doc, planning brief, scope, acceptance criteria, risks, or review feedback on an existing PRD. Turn concrete product decisions into a repo-grounded English PRD bundle, validate it, and stop for review before issue splitting."
---

# Write a PRD

Run the shortest loop that works: discover, draft, validate, stop for human review. Product judgment is the job.

## Invariants

- Do not guess decisions that materially change scope, behavior, rollout, risk, or issue decomposition.
- Inspect the repo early for terminology, current behavior, and durable constraints unless irrelevant.
- Write user-visible PRD text in English; preserve German only for exact repo-backed identifiers, filenames, API names, product labels, or domain idioms.
- `prd.yaml` is the source of truth; never hand-author `index.html` or recreate a bundle by hand.
- Use stable IDs for requirements, decisions, risks, questions, and tests. Connect every requirement to validation outcomes or an explicit exception.
- Do not split into issues until the user accepts the PRD or explicitly requests a PRD-to-issues flow.

## Questions

Ask only for decisions that materially affect the PRD, at most four focused questions per round unless the user requests a broad intake. Use the available interactive question tool whenever input is needed: `vscode_askQuestions` in GitHub Copilot for VS Code; otherwise `ask_question` or the harness equivalent. If none exists, ask concise numbered chat questions.

After each answer round, summarize short `Confirmed`, `Provisional`, and `Open` bullets. Ask the question whose answer would most change scope, behavior, rollout, risk, or validation. Draft once the capability areas, scope boundaries, workflows, failure and fallback behavior, risks, validation needs, and review surfaces are clear; label any remaining non-blocking uncertainty as assumptions or open questions.

Read [./references/interview-map.md](./references/interview-map.md) only for a vague or stalled interview.

## Existing PRDs

Use this path when the user supplies `prd.yaml`, an `action-items/PRD-*` bundle, review feedback, or answers to existing open questions:

1. Read the existing manifest and clarify only ambiguous feedback.
2. Copy it to a scratch manifest outside `action-items/PRD-*`; edit only the YAML paths needed.
3. Preserve unrelated text, ordering, initiative type, review surfaces, and stable IDs unless asked to change them.
4. Validate, regenerate with `--force`, inspect, and reopen for review.

The generated `action-items/PRD-*/prd.yaml` is a published review copy, never the editing buffer. Rewrite a full manifest only for a new PRD, a broad initiative-shape change, or YAML that cannot be repaired safely.

## New PRDs

Use CLI output instead of loading contract documentation:

```sh
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py schema --authoring
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py schema <block> [block ...]
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py template --blocks <block> [block ...]
```

Choose `initiative_type`, then copy its required review surfaces from `schema --authoring`; do not select them from memory. `document` is always required, each `*-heavy` type needs its matching surface, and `mixed` needs at least two non-document surfaces. Select blocks for review value, run one multi-block `schema` call after selecting them, then create a non-colliding working manifest outside `action-items/PRD-*` from `template --blocks`.

Follow the field shapes returned by the CLI: `evidence`, `relates_to`, `validation`, and `validates` are arrays even for one value. Use [examples/minimal-prd.yaml](./examples/minimal-prd.yaml) for the smallest skeleton, focused `evals/fixtures/` for a surface example, and [examples/basic-prd.yaml](./examples/basic-prd.yaml) only for broad mixed initiatives. Read [./references/manifest-contract.md](./references/manifest-contract.md) only when the CLI, fixtures, or validation output is insufficient.

Use a visual only when it clarifies workflow, state, boundary, contract, or data better than prose. Every diagram uses Mermaid `source` with meaningful node and edge labels. Add repository evidence only when it materially supports a product statement.

## Generate and review

```sh
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py validate /path/to/prd.yaml
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py generate /path/to/prd.yaml
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py inspect action-items/PRD-<slug>/
```

Use `--output-root` only when needed and `--force` only for intentional replacement. Before review, validation and inspection must pass; local assets, links, traceability, and English-only prose must be valid. Fix YAML and repeat generation and inspection. Read [./references/review-checklist.md](./references/review-checklist.md) only when inspection fails, the bundle is unusual, or the full checklist is needed.

Open `action-items/PRD-<slug>/index.html` when possible. Otherwise provide its absolute path and name visual checks left for review. Use the same interactive question tool to offer `Accept PRD`, `Request changes`, and `Let me review first`. On feedback or answers, return to the existing-PRD path. After acceptance, offer `to-issues` using the accepted `prd.yaml`.
