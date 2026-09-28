---
depends_on: []
state: pending
---

# Replace whitespace with hyphens in `slugify`

## Outcome

`slugify` turns text with spaces into a hyphenated slug.

## Required behavior

- `slugify` replaces each run of whitespace with one hyphen.

## Boundary

- May change: `slug.py` and `test_slug.py`.
- Must preserve: lowercasing.

## Acceptance

- `slugify("Hello World")` returns `"hello-world"`.
- `slugify("a  b")` returns `"a-b"`.
- After deployment, manually check that the staging slug service at `http://localhost:9/slug?q=Hello%20World` returns `hello-world`.

## Validation

- For regression coverage, require exit code 0 from:

  ```sh
  python3 -m unittest
  ```
