# PRD bundle review checklist

## Bundle integrity

- `index.html`, `prd.yaml`, and every referenced local asset exist under `action-items/PRD-<slug>/`.
- Versioned assets are copied into the bundle without machine-specific absolute paths.
- Fragment links resolve, and local asset links stay inside the bundle.
- Placeholder and template markers are absent.
- Normalized `prd.yaml` matches rendered `index.html`.

## Identity and traceability

- Stable IDs are unique and unchanged across regeneration while their entities keep the same meaning.
- Every requirement has validation coverage or an explicit exception.
- Every relationship resolves to an existing stable ID.

## Content integrity

- Every visual has a useful text description.
- Mermaid source is readable and shows the decision, failure, fallback, or boundary paths that affect acceptance.
- `validate` reports zero `untranslated_german_candidates`, or every remaining German string is exact repository terminology with evidence where its field supports it.

## Consistency

- No two decisions, requirements, or constraints contradict each other or the repository facts.
- Each combined choice, such as "both methods", states how its parts combine.

## Human review

- User-visible prose follows ASD-STE100, with repository-backed terminology reproduced verbatim.
- `validate` and `inspect` check only sentence length, so voice, tense, and word choice need a reader.

## Visual checks

Do these checks on the rendered page, or list each one that you did not do in the report:

- Each Mermaid diagram renders, and its labels are readable.
- The design tree graph shows every node with its id, label, and status.
- The page has no horizontal scroll at a narrow window width.
- Long text in cards and tables wraps and stays inside its container.
- Each link in the page navigation and each reference link goes to its target.

The review is complete when every deterministic check passes, and prose register, responsive layout, and rendered accessibility have been previewed or assigned to human review.
