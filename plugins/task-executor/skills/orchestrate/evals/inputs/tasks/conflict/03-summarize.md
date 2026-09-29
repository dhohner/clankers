---
depends_on:
  - 01-slugify.md
  - 02-slugify-trim.md
state: pending
---

# Add a `summarize` helper

## Outcome

`summarize` returns the slug of a text.

## Required behavior

- `summary.py` defines `summarize(text)`, which returns `slugify(text)`.

## Boundary

- May change: `summary.py` and `test_summary.py`.
- Must preserve: `slug.py`.
- Needs first: `01-slugify.md` and `02-slugify-trim.md`.

## Acceptance

- `summarize(" Hello  World ")` returns `"hello-world"`.

## Validation

- For regression coverage, require exit code 0 from:

  ```sh
  python3 -m unittest
  ```
