---
name: to-prd
description: "Use whenever the user needs a PRD, feature spec, requirements doc, planning brief, or a fuzzy product idea turned into a reviewable English product document. Also use it when the user needs scope, requirements, decisions, risks, acceptance criteria, or review feedback applied to an existing PRD bundle before implementation. Interview until the decisions that shape the plan are concrete, ground the document in the repository, then generate and validate the English-only local PRD bundle before offering issue splitting. When revising after review, make focused edits to the existing prd.yaml and regenerate rather than rewriting the full manifest. Preserve German only for codebase-backed identifiers, labels, or idioms."
---

# Write a PRD

Treat product judgment as the main job. Keep the loop short: discover, draft, validate, then stop for human review.

## Working rules

- Do not guess. Ask when an answer would materially change scope, behavior, rollout, or issue decomposition. Otherwise keep the uncertainty as an assumption or open question.
- Maintain three buckets throughout the interaction:
  - `Confirmed`: stated by the user or strongly evidenced by the repo.
  - `Provisional`: working assumptions that keep planning moving.
  - `Open`: unresolved decisions that could change the initiative shape.
- Use an interactive question tool when available. Otherwise ask concise chat questions.
- Keep interview rounds small. Ask at most 4 questions unless the user explicitly wants a broader intake.
- Present updates in a scannable shape: short `Confirmed`, `Provisional`, and `Open` bullets, then numbered `Questions`.
- Use repository evidence for terminology, current behavior, and durable constraints. Do not turn a helpful file path or symbol into a mandatory implementation plan unless that precision matters to the product decision.
- Write every user-visible PRD string in English, even when the user prompt, repository comments, or existing planning artifacts are German.
- Preserve German only for exact code identifiers, file names, API names, product labels, or domain idioms that already appear in the analyzed repository. When you keep German wording, treat it as quoted repository terminology and attach evidence where the manifest supports evidence.
- After human review, treat `action-items/PRD-<slug>/prd.yaml` as the editable source. Read it, map feedback to the smallest YAML paths that need changes, and preserve unrelated text, ordering, and stable IDs.

## 1. Discover the initiative

Read [./references/interview-map.md](./references/interview-map.md) before the first serious interview round. Use it as a decision map, not a script.

Start by extracting whatever is already known from the conversation: problem, users, desired outcome, constraints, deadlines, and non-goals. Inspect the repository early unless it is clearly irrelevant.

Choose each next question by asking which missing answer would most change the PRD. After each round, summarize what moved between `Confirmed`, `Provisional`, and `Open`.

Before drafting, make sure the PRD can honestly describe:

- the main capability areas;
- what is in scope and explicitly out of scope;
- the key user-visible workflows, failure paths, and fallback behavior;
- the decisions, risks, and regressions that need explicit validation;
- which review surfaces matter: document, workflow, UI, API, data, and/or architecture.

Stop interviewing once the remaining uncertainty can be labeled without changing the overall initiative shape.

## 2. Author the source of truth

Read [./references/manifest-contract.md](./references/manifest-contract.md). Create a YAML manifest in a temporary workspace path or another non-colliding location. The manifest is the source of truth; do not hand-author `index.html`.

Your responsibilities:

- synthesize the interview and repository evidence;
- translate German user input and repository prose into natural English PRD text;
- choose the initiative type, review surfaces, and only the blocks that improve review quality;
- write requirements, decisions, risks, testing intent, and open questions with stable IDs and traceability where required;
- include visuals only when they clarify a workflow, state, boundary, or contract better than prose alone.
- prefer native diagram data for simple node-edge flows, and reserve Mermaid for branches, loops, boundaries, lifecycle states, or cross-system flows.
- make Mermaid diagrams small, review-question focused, and explicit about decision, failure, fallback, and boundary paths.

The generator is responsible for contract validation, canonical rendering, asset copying, bundle staging, and structural output validation.

Use `python3` and keep the workflow portable:

```sh
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py validate \
  /path/to/prd-manifest.yaml
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py generate \
  /path/to/prd-manifest.yaml
```

Use `--output-root <directory>` only when needed by the workspace.
Use `--force` only when intentionally replacing an earlier draft after revising the manifest.

If `python3` is unavailable, report that deterministic generation is blocked and preserve the manifest for another environment. Do not recreate the bundle by hand.

## 3. Validate deterministically

Read [./references/review-checklist.md](./references/review-checklist.md). Generator success is necessary, not sufficient.

After generation:

1. Inspect the produced bundle and assets.
2. Check the rendered PRD and `prd.yaml` for German prose. Translate it to English unless the exact phrase is a codebase-backed identifier, product label, or domain idiom.
3. Treat deterministic validation as the gate for agent-side completion: the manifest must parse, the generator must succeed, and the staged bundle must satisfy the structural checks in the checklist.
4. If validation fails, fix the manifest and regenerate. Leave responsive, print, and rendered accessibility judgment to the human reviewer unless the environment provides a low-cost preview path.

Fix structural or content issues by editing the manifest and regenerating. Treat `prd.yaml` as the planning source of truth and `index.html` as the review surface.

## 4. Request human review

Open the bundle for the user with:

```sh
open action-items/PRD-<slug>/index.html
```

Ask the user to accept the PRD or request changes.

When the user requests changes:

1. Read the existing `action-items/PRD-<slug>/prd.yaml`.
2. Restate the requested deltas only if the feedback is ambiguous.
3. Apply focused YAML edits with the editing tool instead of rewriting the file from scratch.
4. Preserve stable IDs for unchanged requirements, decisions, risks, questions, and tests.
5. Regenerate from that edited `prd.yaml` with `--force`, rerun the relevant validation, and reopen the revised bundle.

Only rewrite the full manifest when the user asks for a new PRD, changes the initiative shape so broadly that most blocks are obsolete, or the existing `prd.yaml` is invalid and cannot be repaired with targeted edits.

Do not treat the draft as accepted until human review is complete. Keep `prd.yaml` beside `index.html` so the accepted source remains available.

## 5. Offer issue splitting

Only after the user accepts the PRD, offer to pass the accepted bundle to `to-issues`.

Invoke `to-issues` only when the user asks for issue splitting, accepts the handoff, or originally requested an end-to-end PRD-to-issues flow. Pass the accepted `prd.yaml` as the planning source and include `index.html` as the reviewer-facing companion when it helps preserve context. If you mention only one bundle file during handoff, mention `prd.yaml`.

## 6. Clean up temporary files

After generation succeeds, delete the scratch YAML manifest created outside the bundle. Keep only the generated PRD bundle in `action-items/PRD-<slug>/`, including its preserved `prd.yaml`.
