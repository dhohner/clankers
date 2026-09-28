---
depends_on: []
state: pending
---

# Apply the agreed public URL separator

## Outcome

`slugify` produces URL slugs with hyphens between words.
The product owner approved this public output change, including replacement of spaces, tabs, and newlines.

## Required behavior

- `slugify` replaces each run of whitespace with one hyphen.

## Boundary

- May change: `slug.py` and `test_slug.py`.
- Must preserve: lowercasing.

## Acceptance

- `slugify("Hello World")` returns `"hello-world"`.
- `slugify("a  b")` returns `"a-b"`.
- `slugify("Hello\t \nWorld")` returns `"hello-world"`.

## Validation

- For regression coverage, require exit code 0 from:

  ```sh
  python3 -m unittest
  ```
