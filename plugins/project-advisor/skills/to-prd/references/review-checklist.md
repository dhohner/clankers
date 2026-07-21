# PRD Bundle Review Checklist

## Bundle integrity

- `index.html`, `prd.yaml`, and every referenced local asset exist under `action-items/PRD-<slug>/`.
- Versioned assets are copied into the bundle without machine-specific absolute paths.
- Fragment links resolve, and local asset links remain inside the bundle.
- Placeholder and template markers are absent.
- Normalized `prd.yaml` matches rendered `index.html`.

## Identity and traceability

- Stable IDs are unique and unchanged across regeneration while their entities retain the same meaning.
- Every requirement has validation coverage or an explicit exception.
- Every relationship resolves to an existing stable ID before publication.

## Content integrity

- Every visual has a useful text description.
- Mermaid source is readable and shows decision, failure, fallback, or boundary paths when they affect acceptance.
- User-visible prose is English; German is limited to exact repository-backed terminology, with evidence where its field supports it.

**Complete when:** every deterministic check passes, and responsive layout, print polish, and rendered accessibility have been previewed or assigned to human review.
