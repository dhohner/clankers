# PRD Bundle Review Checklist

Apply this checklist after the generator succeeds and before requesting human acceptance. For agent-side validation, complete the structural and traceability checks that can be verified deterministically. Treat responsive, print, accessibility rendering, and other visual-fit questions as prompts for the human reviewer when they open the generated bundle.

## Structure and portability

- `index.html`, `prd.json`, and every referenced local asset exist inside `action-items/PRD-<slug>/`.
- The copied files under `assets/` are the generator's versioned assets; the bundle does not depend on a virtual environment, package install, or machine-specific absolute asset path.
- IDs are unique and stable across regeneration when the underlying requirement, decision, risk, question, or validation outcome has not changed.
- Fragment links resolve, local asset links stay inside the bundle, and no placeholder or template marker remains.
- The normalized `prd.json` represents the same initiative and content shown in `index.html`.

## Traceability

- Each requirement has a stable ID and connects to a validation outcome or an explicit exception.

Fix failures in the manifest or generator, regenerate, and repeat the relevant deterministic checks. Leave responsive, print, and rendered accessibility checks for human review unless the environment already provides a low-cost preview path.
