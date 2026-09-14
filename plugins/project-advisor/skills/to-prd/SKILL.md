---
name: to-prd
description: >-
  Write or revise a PRD as a validated local review bundle.
  Use when the user wants a feature idea or product decisions turned into a PRD, or review feedback folded into an existing `prd.yaml`.
---

# Author a PRD

Interview the user, write `prd.yaml`, publish the bundle, and hold the review gate until the user accepts.
The agent owns product judgment, and the generator owns validation and publication.
Write questions, manifest prose, and the report in ASD-STE100 Simplified Technical English:

- one instruction per sentence, at most twenty words
- active voice and present tense
- one meaning per word, and noun clusters of at most three words

Reproduce repository-backed identifiers, labels, and quoted strings verbatim.

Run every CLI command from the repository root:

```sh
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py <command> [options]
```

## Ground the decision

For a revision, read the supplied `prd.yaml`, the published `action-items/PRD-*` bundle, the feedback, and answered open questions before proposing changes.
For a repository-backed product, inspect the repository for terminology, current behavior, and durable constraints before the first question.

Structure the interview as a design tree, with dependent decisions branching from their prerequisites.
A decision belongs in the tree when a wrong answer changes scope, a requirement, an acceptance criterion, a risk, or a review surface.
A decision that only changes how, in what order, or with which defaults a requirement is built belongs to implementation, so prune it.

Ask in rounds with the interactive question tool.
Each round asks the whole frontier, the decisions whose prerequisites are settled, with a recommended answer for every question.
Find facts yourself, in the repository or through sub-agents, and put only decisions to the user.
While a fact search runs, ask the rest of the frontier.
Put a question in `open_questions` only when it waits on a fact nobody can find today.

Record the tree in a scratch manifest at an unused path outside `action-items/`.
For a new PRD, start from `template --blocks design_tree` and replace every placeholder node.
For a revision, copy the published `prd.yaml`.
After each round, write its nodes to `blocks.design_tree` with explicit `NODE-*` ids, verbatim questions, and a `settled`, `pruned`, or `deferred` status.
`schema design_tree` prints the fields each status requires.
Nest dependent decisions under their prerequisite's `children`, and link a deferred node to its open question through `relates_to`.

Continue interview rounds until the frontier is empty and no decision rests on an assumption.
Before authoring, present the settled decisions and deferred questions for the user to confirm or correct.
Resume the interview when corrections reopen decisions.

Grounding is complete when every visited branch is recorded and the user confirms the presented understanding.

## Author the manifest

`prd.yaml` is the source of truth, and `index.html` is generated output.

For a new PRD, choose `initiative_type`, take its required review surfaces from `schema --authoring`, and add a block only when it improves a product decision.
Run one `schema` call for the selected blocks, then add their `template --blocks` shapes to the scratch manifest.
Use `examples/minimal-prd.yaml` as the skeleton, `examples/fixtures/` for one focused surface, and `examples/basic-prd.yaml` only for a broad mixed initiative.
Read [references/manifest-contract.md](references/manifest-contract.md) when CLI output and validation errors leave a rule unclear.

For a revision, edit only the paths the feedback or answered questions require.
Set each changed node's `answer` to the current understanding and move the earlier answer to `superseded_answer`.
Keep unrelated text, ordering, initiative type, review surfaces, and stable IDs.
Rewrite the manifest only when the initiative shape changes broadly or the YAML cannot be repaired safely.

In both cases:

- Keep German only for exact repository-backed identifiers, filenames, API names, product labels, or domain idioms, with evidence where the field supports it.
- Give requirements, decisions, risks, questions, and tests stable IDs, and link every requirement to a validation outcome or an explicit exception.
- Add repository evidence only when it supports a product statement.
- Add a diagram only when it shows a workflow, state, boundary, contract, or data relationship better than prose.
  - Give it a description and readable Mermaid `source` whose labels name the nodes and edges.
  - Include the failure, fallback, decision, or boundary paths that affect scope or acceptance.

Authoring is complete when every selected block follows its schema, every requirement is traceable, and every remaining open question waits on a fact nobody can find today and states what blocks it and who owns it.

## Publish and inspect

Run `validate`, `generate`, and `inspect action-items/PRD-<slug>/` on the scratch manifest, and fix the YAML until both pass.
Pass `--force` only to replace the published copy of a revision.
Read [references/review-checklist.md](references/review-checklist.md) when inspection fails or the bundle needs a full audit.

Publication is complete when validation and inspection pass for the intended manifest, including local assets, links, traceability, and English-only ASD-STE100 prose.

## Hold the review gate

Open `action-items/PRD-<slug>/index.html` when the environment allows it.
Otherwise give its absolute path and list the visual checks left to the human.
Offer `Accept PRD` and `Request changes` with the interactive question tool.
Requested changes and answered questions re-enter the interview as a revision.

Only the user's acceptance sets the PRD to `Accepted`.
An acceptance recorded only in chat blocks the handoff, because `to-issues` and `to-agent-tasks` read `status` from the published `prd.yaml`.
On acceptance:

1. Set `status: Accepted` in the working manifest and change nothing else.
2. Rerun `validate`, `generate --force`, and `inspect` with the same `--output-root`, so the published bundle carries the accepted source.
3. Report the published `action-items/PRD-<slug>/prd.yaml` path.

Then offer `to-issues` for Jira-ready tickets, `to-agent-tasks` for coding-agent work packages, or no handoff, and invoke the chosen skill with the published `prd.yaml`.
Run a handoff before acceptance only when the user asks for a combined flow.

The gate is complete when the user has the review bundle with unresolved questions and unperformed visual checks visible, an accepted PRD reads `status: Accepted` in the published `prd.yaml`, and the next action is explicit.
