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

## Human review

- User-visible prose follows ASD-STE100, with repository-backed terminology reproduced verbatim.

The review is complete when every deterministic check passes, and prose register, responsive layout, and rendered accessibility have been previewed or assigned to human review.
