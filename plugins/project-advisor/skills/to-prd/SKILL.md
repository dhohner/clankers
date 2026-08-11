---
name: to-prd
description: >-
  PRD authoring and revision. Use when the user wants product decisions, feature requests, scope, acceptance criteria, or review feedback turned into a validated requirements document.
---

# Author a PRD

Run a decision loop: ground, clarify, author, validate, review.
The agent owns product judgment; the generator owns deterministic publication.
Write interview questions, manifest prose, and the report to the user in **ASD-STE100 Simplified Technical English**: one instruction per sentence, about twenty words or fewer, active voice, present tense, one meaning per word, and noun clusters of at most three words.
Reproduce repository-backed identifiers, labels, and quoted strings verbatim.

## 1. Ground the decision

Classify the request as a new PRD or a revision.
For a revision, read the supplied `prd.yaml`, `action-items/PRD-*` bundle, feedback, and existing open-question answers before proposing changes.
Inspect the repository early for product terminology, current behavior, and durable constraints whenever the product is repository-backed.

Interview the user relentlessly until you reach a shared understanding.
Map this as a **design tree**: every decision branches into the decisions that hang off it. Bound the tree at PRD altitude.
A decision belongs in the interview only when a wrong answer changes scope, a requirement, an acceptance criterion, a risk, or a review surface.
A decision that only changes how a requirement is built, in what order, or with which defaults belongs to the implementation and is out of scope.

Work the tree in **rounds** and use the interactive question tool. When none exists, ask concise numbered chat questions.
The **frontier** is every decision whose prerequisites are already settled - the questions you can ask _now_ without guessing at answers you haven't heard yet.
Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Recompute the frontier after each round of answers, then ask the next round.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it - don't ask the user for anything you could look up yourself.
Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report - ask the rest of the frontier now.
The _decisions_ are the user's - put each to them and wait.

A question belongs in `open_questions` only if it is **unaskable now**: it waits on a fact that cannot be found in the environment today.
Every other uncertainty is a decision the user can make now, so ask it instead.

**Complete when:** the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.

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
Use [examples/minimal-prd.yaml](./examples/minimal-prd.yaml) for the smallest skeleton, `examples/fixtures/` for one focused surface, and [examples/basic-prd.yaml](./examples/basic-prd.yaml) only for a broad mixed initiative.
Read [references/manifest-contract.md](./references/manifest-contract.md) only when CLI output, focused fixtures, and validation errors do not settle the contract.

For either branch:

- Write all user-visible fields in ASD-STE100 English, retaining German only for exact repository-backed identifiers, filenames, API names, product labels, or domain idioms. For retained German, attach evidence where its field supports it; otherwise quote it as repository terminology.
- Preserve or assign stable IDs for requirements, decisions, risks, questions, and tests.
- Connect every requirement to validation outcomes or an explicit exception.
- Follow CLI field shapes; `evidence`, `relates_to`, `validation`, and `validates` are arrays even for one value.
- Add repository evidence only when it materially supports a product statement.
- Add a visual only when it clarifies a workflow, state, boundary, contract, or data relationship better than prose.
- Give every diagram a concise description and readable Mermaid `source` with meaningful node and edge labels. Include failure, fallback, decision, or boundary paths when they affect scope or acceptance.

**Complete when:** a scratch `prd.yaml` exists, every selected block follows its schema, every requirement is traceable, every remaining uncertainty is unaskable per step 1 and carries its blocker and owner, and all stable entities, relationships, changed prose, and visuals satisfy the rules above.

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

**Complete when:** the latest validation and inspection pass for the intended manifest and generated bundle, including local assets, links, traceability, and English-only prose in ASD-STE100.

## 4. Apply the review gate

Open `action-items/PRD-<slug>/index.html` when possible.
Otherwise provide its absolute path and list the visual checks left for human review.
Use the interactive question tool to offer `Accept PRD` and `Request changes`.
Return requested changes or answered questions to step 1 as an existing-PRD revision.
Stop at the review gate while acceptance is pending.

### Publish the acceptance

Acceptance is a state of the PRD, not of the conversation.
`to-issues` and `to-agent-tasks` read the published `prd.yaml`, so an acceptance that stays in the chat blocks the handoff it was meant to unlock.

The user's decision is the only thing that sets `Accepted`.
On that decision, before offering any handoff:

1. Set `status: Accepted` in the working manifest, leaving every other field untouched.
2. Rerun the step 3 commands with `generate --force` and the original `--output-root`, so the reviewed bundle carries the accepted source.
3. Report the published `action-items/PRD-<slug>/prd.yaml` that downstream skills should read.

Then use the interactive question tool to offer `to-issues` for Jira-ready tickets, `to-agent-tasks` for autonomous coding-agent work packages, or no handoff.
If the user picks one, invoke that skill with the published `prd.yaml` as its source.
Issue splitting and task generation stay behind acceptance unless the user explicitly requests a combined flow.

**Complete when:** the user has the review bundle, unresolved questions and unperformed visual checks are visible, an accepted PRD reads `status: Accepted` in the published `prd.yaml`, and the next action is explicit.
