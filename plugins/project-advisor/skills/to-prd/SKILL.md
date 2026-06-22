---
name: to-prd
description: "Use whenever the user needs a PRD, feature spec, requirements doc, planning brief, or a fuzzy product idea turned into a reviewable product document. Also use it when the user needs scope, requirements, decisions, risks, or acceptance criteria clarified before implementation. Interview until the decisions that shape the plan are concrete, ground the document in the repository, then generate and validate the local PRD bundle before offering issue splitting."
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

Read [./references/manifest-contract.md](./references/manifest-contract.md). Create a JSON manifest in a temporary workspace path or another non-colliding location. The manifest is the source of truth; do not hand-author `index.html`.

Your responsibilities:

- synthesize the interview and repository evidence;
- choose the initiative type, review surfaces, and only the blocks that improve review quality;
- write requirements, decisions, risks, testing intent, and open questions with stable IDs and traceability where required;
- include visuals only when they clarify a workflow, state, boundary, or contract better than prose alone.

The generator is responsible for contract validation, canonical rendering, asset copying, bundle staging, and structural output validation.

Use `python3` and keep the workflow portable:

```sh
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py \
  /path/to/prd-manifest.json
```

Use `--output-root <directory>` only when needed by the workspace. Use `--force` only when intentionally replacing an earlier draft after revising the manifest.

If `python3` is unavailable, report that deterministic generation is blocked and preserve the manifest for another environment. Do not recreate the bundle by hand.

## 3. Validate deterministically

Read [./references/review-checklist.md](./references/review-checklist.md). Generator success is necessary, not sufficient.

After generation:

1. Inspect the produced bundle and assets.
2. Treat deterministic validation as the gate for agent-side completion: the manifest must parse, the generator must succeed, and the staged bundle must satisfy the structural checks in the checklist.
3. If validation fails, fix the manifest and regenerate. Leave responsive, print, and rendered accessibility judgment to the human reviewer unless the environment provides a low-cost preview path.

Fix structural or content issues by editing the manifest and regenerating. Treat `prd.json` as the planning source of truth and `index.html` as the review surface.

## 4. Request human review

Open the bundle for the user with:

```sh
open action-items/PRD-<slug>/index.html
```

Ask the user to accept the PRD or request changes. If they ask for changes, update the manifest, regenerate with `--force`, rerun the relevant validation, and reopen the revised bundle.

Do not treat the draft as accepted until human review is complete. Keep `prd.json` beside `index.html` so the accepted source remains available.

## 5. Offer issue splitting

Only after the user accepts the PRD, offer to pass the accepted bundle to `to-issues`.

Invoke `to-issues` only when the user asks for issue splitting, accepts the handoff, or originally requested an end-to-end PRD-to-issues flow. Pass the accepted `prd.json` as the planning source and include `index.html` as the reviewer-facing companion when it helps preserve context. If you mention only one bundle file during handoff, mention `prd.json`.
