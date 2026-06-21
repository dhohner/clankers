---
name: to-prd
description: "Use whenever the user wants a PRD, feature spec, requirements doc, planning brief, or a fuzzy idea turned into a reviewable product document. Interview until the problem, actors, scope, constraints, tradeoffs, and validation bar are concrete; ground product statements in the repository; then generate and validate the local HTML PRD bundle before offering issue splitting."
---

# Write a PRD

Treat the interview and product judgment as the main job. Use the bundled generator for deterministic rendering, validation, and asset publication.

## Operating rules

- Do not guess. Ask when an answer would materially change scope, behavior, rollout, or issue decomposition. Otherwise keep the uncertainty as an assumption or open question.
- Maintain three buckets throughout the interaction:
  - `Confirmed`: stated by the user or strongly evidenced by the repo.
  - `Provisional`: working assumptions that keep planning moving.
  - `Open`: unresolved decisions that could change the initiative shape.
- Use an interactive question tool when available. Otherwise ask concise chat questions.
- Keep interview rounds small. Ask at most 4 questions unless the user explicitly wants a broader intake.
- Present updates in a scannable shape: short `Confirmed`, `Provisional`, and `Open` bullets, then numbered `Questions`.
- Use repository evidence for terminology, current behavior, and durable constraints. Do not turn a helpful file path or symbol into a mandatory implementation plan unless that precision matters to the product decision.

## 1. Discover and align

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

## 2. Author the manifest

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

## 3. Validate before review

Read [./references/review-checklist.md](./references/review-checklist.md). Generator success is necessary, not sufficient.

After generation:

1. Inspect the produced bundle and assets.
2. Perform visual review with the best tool available: browser or preview first, `open` second, source inspection plus explicit human follow-up last.
3. Check desktop, narrow/mobile, and print behavior when the environment allows it.

Fix structural, content, or visual issues by editing the manifest and regenerating. Do not claim visual validation the environment could not actually perform.

## 4. Request acceptance

Open the bundle for the user with:

```sh
open action-items/PRD-<slug>/index.html
```

Ask the user to accept the PRD or request changes. If they ask for changes, update the manifest, regenerate with `--force`, rerun the relevant validation, and reopen the revised bundle.

Do not treat the draft as accepted until human review is complete. Keep `prd.json` beside `index.html` so the accepted source remains available.

## 5. Offer issue splitting

Only after the user accepts the PRD, offer to pass the accepted bundle to `to-issues`.

Invoke `to-issues` only when the user asks for issue splitting, accepts the handoff, or originally requested an end-to-end PRD-to-issues flow. Pass the accepted `index.html` as the review source and keep `prd.json` for traceability.
