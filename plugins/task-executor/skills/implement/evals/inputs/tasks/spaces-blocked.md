---
depends_on: []
state: pending
---

# Replace whitespace with hyphens in `slugify`

## Outcome

`slugify` turns text with spaces into a hyphenated slug.

## Required behavior

- `slugify` replaces each run of whitespace with one hyphen.
- `slugify` transliterates accented letters, such as `é` to `e`.

## Boundary

- May change: `slug.py` and `test_slug.py`.
- Must preserve: lowercasing.
- Blockers: accented letter transliteration requires the product owner's choice of a transliteration table.

## Acceptance

- `slugify("Hello World")` returns `"hello-world"`.
- `slugify("a  b")` returns `"a-b"`.

## Validation

- For regression coverage, require exit code 0 from:

  ```sh
  python3 -m unittest
  ```
