---
name: to-prd
description: >-
  PRD authoring and revision. Use when the user wants product decisions, feature requests, scope, acceptance criteria, or review feedback turned into a validated requirements document.
---

# Author a PRD

Run a decision loop: ground, clarify, author, validate, review.
The agent owns product judgment; the generator owns deterministic publication.

## 1. Ground the decision

Classify the request as a new PRD or a revision.
For a revision, read the supplied `prd.yaml`, `action-items/PRD-*` bundle, feedback, and existing open-question answers before proposing changes.
Inspect the repository early for product terminology, current behavior, and durable constraints whenever the product is repository-backed.

Surface material uncertainty instead of silently choosing scope, behavior, rollout, risk, or validation policy.
Ask at most four focused questions per round unless the user requests broad intake.
Use `vscode_askQuestions` in GitHub Copilot for VS Code, otherwise `ask_question` or the harness equivalent; when none exists, ask concise numbered chat questions.
After each answer round, summarize short `Confirmed`, `Provisional`, and `Open` bullets, then ask the unresolved question with the greatest effect on scope, behavior, rollout, risk, or validation.
Read [references/interview-map.md](./references/interview-map.md) before continuing only when the request is vague, broad, or the interview stalls.

**Complete when:** every applicable product area is understood well enough to state the problem, actors, scope boundaries, workflow and failure behavior, constraints, risks, validation outcomes, and review surfaces, with each material uncertainty marked `Confirmed`, `Provisional`, or `Open`.

## 2. Author the working manifest

Treat `prd.yaml` as the source of truth and `index.html` as generated output.
Keep the working manifest outside `action-items/PRD-*`; that directory is a published review copy.

### Revise an existing PRD

1. Copy the existing manifest to a non-colliding scratch path.
2. Edit only the YAML paths required by the feedback or resolved questions.
3. Preserve unrelated text, ordering, initiative type, review surfaces, and stable IDs.
4. Rewrite the full manifest only when the user requests a broad initiative-shape change or the YAML cannot be repaired safely.

### Author a new PRD

Use the CLI as the manifest contract:

```sh
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py schema --authoring
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py schema <block> [block ...]
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py template --blocks <block> [block ...]
```

Choose `initiative_type`, derive its required review surfaces from `schema --authoring`, and select blocks only when they improve a product decision.
Every initiative includes `document`; `mixed` also includes at least two non-document surfaces.
After selecting blocks, run one multi-block `schema` call and create a non-colliding scratch manifest from `template --blocks`.
Use [examples/minimal-prd.yaml](./examples/minimal-prd.yaml) for the smallest skeleton, `evals/fixtures/` for one focused surface, and [examples/basic-prd.yaml](./examples/basic-prd.yaml) only for a broad mixed initiative.
Read [references/manifest-contract.md](./references/manifest-contract.md) only when CLI output, focused fixtures, and validation errors do not settle the contract.

For either branch:

- Write all user-visible fields in English, retaining German only for exact repository-backed identifiers, filenames, API names, product labels, or domain idioms.
- Preserve or assign stable IDs for requirements, decisions, risks, questions, and tests.
- Connect every requirement to validation outcomes or an explicit exception.
- Follow CLI field shapes; `evidence`, `relates_to`, `validation`, and `validates` are arrays even for one value.
- Add repository evidence only when it materially supports a product statement.
- Add a visual only when it clarifies a workflow, state, boundary, contract, or data relationship better than prose.
- Give every diagram a concise description and readable Mermaid `source` with meaningful node and edge labels.

**Complete when:** a scratch `prd.yaml` exists, every selected block follows its schema, every requirement is traceable, every material uncertainty is explicit, and all stable entities, relationships, changed prose, and visuals satisfy the rules above.

## 3. Publish and inspect

From the repository root, run:

```sh
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py validate /path/to/prd.yaml
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py generate /path/to/prd.yaml
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py inspect action-items/PRD-<slug>/
```

Use `--output-root` only for an intentional alternate destination.
Use `--force` only to replace the published copy during an intentional revision.
Fix the scratch YAML and repeat validation, generation, and inspection after any failure.
Read [references/review-checklist.md](./references/review-checklist.md) only when inspection fails, the bundle is unusual, or a full audit is needed.

**Complete when:** the latest validation and inspection pass for the intended manifest and generated bundle, including local assets, links, traceability, and English-only prose.

## 4. Apply the review gate

Open `action-items/PRD-<slug>/index.html` when possible.
Otherwise provide its absolute path and list the visual checks left for human review.
Use the interactive question tool to offer `Accept PRD` and `Request changes`.
Return requested changes or answered questions to step 1 as an existing-PRD revision.
After acceptance, offer `to-issues` using the accepted `prd.yaml`.
Issue splitting remains behind PRD acceptance unless the user explicitly requests a combined PRD-to-issues flow.
Stop at the review gate while acceptance is pending.

**Complete when:** the user has the review bundle, unresolved questions and unperformed visual checks are visible, and the next action is explicit.
