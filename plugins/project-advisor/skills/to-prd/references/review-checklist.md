# PRD Bundle Review Checklist

Use this only when `inspect` is not enough, a bundle is unusual, or validation reports a problem.
For the normal path, run:

```sh
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py validate action-items/PRD-<slug>/prd.yaml
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py inspect action-items/PRD-<slug>/
```

## Deterministic checks

Fix these before requesting human acceptance:

- `index.html`, `prd.yaml`, and referenced local assets exist under `action-items/PRD-<slug>/`.
- The bundle uses copied versioned assets and no machine-specific absolute asset paths.
- Fragment links resolve and local asset links stay inside the bundle.
- No placeholder or template marker remains.
- The normalized `prd.yaml` matches the content shown in `index.html`.
- Stable IDs are unique and preserved across regeneration when meaning has not changed.
- Each requirement has validation coverage or an explicit exception.
- Broken relationships are fixed before publication.
- Every diagram has a useful text description.
- Mermaid source is small, readable, and shows decision, failure, fallback, or boundary paths when those paths affect acceptance.
- User-visible PRD prose is English.
- German appears only as exact repository-backed terminology and has evidence where supported.

Leave responsive layout, print polish, and rendered accessibility judgment to human review unless the environment already provides a low-cost preview path.
