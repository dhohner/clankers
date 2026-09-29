---
depends_on:
  - 01-slugify.md
  - 02-word-count.md
state: pending
---

# Add a `summarize` helper

## Outcome

`summarize` returns the slug and the word count of a text.

## Required behavior

- `summary.py` defines `summarize(text)`, returning a dict with `"slug"` from `slugify` and `"words"` from `word_count`.

## Boundary

- May change: `summary.py` and `test_summary.py`.
- Must preserve: `slug.py` and `wordcount.py`.
- Needs first: `01-slugify.md` and `02-word-count.md`.

## Acceptance

- `summarize("Hello  World")` returns `{"slug": "hello-world", "words": 2}`.

## Validation

- For regression coverage, require exit code 0 from:

  ```sh
  python3 -m unittest
  ```
