---
depends_on: []
state: pending
---

# Trim whitespace around a slug

## Outcome

`slugify` returns no leading or trailing whitespace.

## Required behavior

- `slugify` strips leading and trailing whitespace before lowercasing the text.

## Boundary

- May change: `slug.py` and `test_slug.py`.
- Must preserve: lowercasing.

## Acceptance

- `slugify("  Hello ")` returns `"hello"`.

## Validation

- For regression coverage, require exit code 0 from:

  ```sh
  python3 -m unittest
  ```
