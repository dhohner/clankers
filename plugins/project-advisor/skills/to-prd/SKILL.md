---
name: to-prd
description: "Use when the user wants a PRD, feature spec, requirements doc, planning brief, or help turning a fuzzy product idea, conversation, draft, or rough proposal into something reviewable. Interview until the problem, users, constraints, scope, tradeoffs, and capability boundaries are shared and concrete; ground decisions in the repository; then generate and validate a portable English HTML PRD bundle for human review and optional issue splitting."
---

# Write a PRD

Treat the interview and product judgment as the core work. Use the bundled generator for deterministic validation, rendering, asset copying, and publication.

Do not guess what the user meant. Ask when a decision would change scope, behavior, rollout, or issue decomposition. Otherwise preserve uncertainty as a labeled assumption or open question.

Maintain three buckets:

- `Confirmed`: stated by the user or strongly evidenced by the repository.
- `Provisional`: assumptions that let planning continue, clearly labeled.
- `Open`: unresolved decisions that could materially change the plan.

Use an interactive question tool when available. Otherwise ask concise questions in chat. Keep each round focused on the few answers that would most change the PRD.

## 1. Discover and ground

Extract the problem, users, desired outcome, constraints, deadlines, and non-goals already present in the conversation.

Read [references/interview-map.md](references/interview-map.md) before the first serious interview round. Use it as a decision map, not a script.

Inspect the repository early unless it is empty or irrelevant. Use code, tests, schemas, APIs, ADRs, and existing documents as evidence for terminology, current behavior, durable constraints, and adjacent workflows. Surface conflicts between repository evidence and the user's request instead of silently resolving them.

Repository analysis informs product judgment; it does not make exact implementation paths mandatory. Record exact paths or symbols only when they materially support a product statement.

## 2. Reach shared understanding

Choose each next question by asking which missing answer would most change the PRD. After each round, summarize what moved between `Confirmed`, `Provisional`, and `Open`.

Before drafting, confirm or clearly label:

- the major capability areas;
- the main in-scope and out-of-scope boundaries;
- the user-visible workflows and failure paths;
- the decisions, risks, and regressions that require explicit validation;
- the review surfaces that would materially improve understanding.

Stop interviewing when the remaining uncertainty can be represented honestly without changing the basic initiative shape.

## 3. Author the manifest

Read [references/manifest-contract.md](references/manifest-contract.md). Create a JSON manifest in a temporary workspace location or another non-colliding path. The manifest is the planning source; do not hand-author `index.html`.

Agent responsibilities:

- synthesize the interview and repository evidence;
- choose the initiative type, review surfaces, and useful blocks;
- write product content and relationships;
- distinguish decisions, assumptions, evidence, and open questions;
- decide whether a diagram, wireframe, prototype, table, or other visual is relevant.

Generator responsibilities:

- validate the JSON contract and traceability relationships;
- escape content and render blocks in canonical order;
- create `action-items/PRD-<slug>/index.html`;
- preserve the normalized source as `action-items/PRD-<slug>/prd.json`;
- copy the versioned assets into `action-items/PRD-<slug>/assets/`;
- structurally validate required files, IDs, anchors, and local asset resolution before publishing.

Use `python3`; do not require a virtual environment, package installation, Node.js, a browser tool, or a Codex-specific harness:

```sh
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py \
  /path/to/prd-manifest.json
```

Use `--output-root <directory>` only when the workspace requires a different parent. Use `--force` only when intentionally replacing the same draft bundle after revising its manifest.

If `python3` is unavailable, report the blocked deterministic generation step and preserve the completed manifest for another environment. Do not silently recreate the bundle by hand.

## 4. Validate before human review

Read [references/review-checklist.md](references/review-checklist.md). Structural validation by the generator is necessary but not sufficient. Inspect the generated document and assets, then perform visual review using the best capability available:

1. Use a browser or preview tool when available.
2. Otherwise open the local file with an available operating-system mechanism.
3. Otherwise provide the absolute `index.html` path and use source inspection plus the print and responsive checklist; tell the user which visual checks remain for their review.

Subagents are optional. If available, a reviewer may independently return `Approved` or `Issues Found`; otherwise perform the same review inline. Do not make the workflow depend on subagents.

Fix structural, content, or visual issues by editing the manifest and regenerating the bundle. Review desktop, narrow/mobile, and print behavior before asking the user for acceptance. Do not claim visual validation that the environment could not perform.

## 5. Request acceptance

Expose or open `action-items/PRD-<slug>/index.html` for review and identify the bundle directory. Ask the user to accept it or request changes.

If the user requests changes, update the manifest, regenerate with `--force`, repeat structural and visual validation, and expose the revised bundle again.

Do not call a draft accepted when human review is unavailable or pending. Keep the generated `prd.json` with the bundle so the accepted source remains available for later issue splitting.

## 6. Offer issue splitting

Only after the user accepts the PRD, offer to pass the accepted bundle to `to-issues`.

Invoke `to-issues` only when the user:

- asks for issue splitting;
- accepts the offered handoff; or
- originally requested an end-to-end PRD-to-issues workflow.

Pass the accepted bundle's `index.html` as the review source and retain `prd.json` beside it for traceability. Otherwise stop after reporting the saved bundle path.
