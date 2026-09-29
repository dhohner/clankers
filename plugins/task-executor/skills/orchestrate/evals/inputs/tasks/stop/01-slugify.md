---
depends_on: []
state: pending
---

# Join slug words with the product separator

## Outcome

`slugify` joins title words with the product's public URL separator.

## Required behavior

- `slugify` replaces each run of whitespace with the product URL separator.
- The product owner has not chosen between a hyphen and an underscore.
  - Published URLs depend on this choice.

## Boundary

- May change: `slug.py` and `test_slug.py`.
- Must preserve: lowercasing.

## Acceptance

- `slugify("Hello World")` returns the two words joined by the product URL separator.

## Validation

- For regression coverage, require exit code 0 from:

  ```sh
  python3 -m unittest
  ```
