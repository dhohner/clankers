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

Put only decisions to the user, and find facts yourself in the repository or through sub-agents.
Put a question in `open_questions` only when it waits on a fact nobody can find today.

### Keep the session

Start a new interview session for a new PRD and for each revision.
The session directory is one new scratch directory outside `action-items/`, and it holds the scratch `prd.yaml` and the round files.
For a new PRD, write the scratch `prd.yaml` from `template --blocks design_tree`, and replace every placeholder node.
For a revision, copy the published `prd.yaml` into the session directory.

### Ask each round in the browser

Ask each round with `interview ask <session-dir> <round-file>`.
Each round asks the whole frontier, the decisions whose prerequisites are settled.
Write the round to a new round file in the session directory, such as `round-01.yaml`.
Give each question the `NODE-*` id of its design tree node and a recommended answer.
`interview ask --help` prints the round file fields and an example.

Before each `interview ask`, tell the user in one chat line that the round is open in the browser and you wait for the answers.
Run `interview ask` as a foreground command with the largest timeout your tool allows, or as a tracked background job of your tool.
When `interview ask` stops before it prints a result, run the same `interview ask` again.
The session keeps the round, and the page keeps the draft answers.

Start each fact search before the round, so it runs while the user answers: as a background sub-agent beside a foreground `interview ask`, or in the foreground beside a background one.
Without background work, complete each fact search before the round.

Each result prints a `message` when you must act and `next` lines with the commands that can follow, so follow them.
After `answered`, record the answers, then ask the next frontier.

Without a local browser, tell the user before the first round, and the user can delegate the answers to you.
When the user delegates the answers, skip the browser round, and record your recommended answer for each question with `source: user`.

### Record the answers

After each round, write its nodes to `blocks.design_tree` with explicit `NODE-*` ids, verbatim questions, and a `settled`, `pruned`, or `deferred` status.
Write each answer as the `instructions` line of the `answered` result says.
Record a decision that a fact search settles as `settled` with `source: research` and its evidence.
Use the notes and the round comment to write the rationale and to find new decisions.
Nest dependent decisions under their prerequisite's `children`.
`schema design_tree` prints the fields each status requires.

### End the interview

Continue the rounds until the frontier is empty and no decision rests on an assumption.
Then run `interview end <session-dir>` and author the manifest.
The user corrects a decision at the review gate with `Request changes`.

Grounding is complete when every visited branch is recorded, the frontier is empty, and `status` lists no live interview session.

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
