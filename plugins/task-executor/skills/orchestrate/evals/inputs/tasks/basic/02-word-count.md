---
depends_on: []
state: pending
---

# Add a `word_count` helper

## Outcome

`word_count` counts the words in a text.

## Required behavior

- `wordcount.py` defines `word_count(text)`, which returns the count of words separated by whitespace in `text`.

## Boundary

- May change: `wordcount.py` and `test_wordcount.py`.
- Must preserve: `slug.py`.

## Acceptance

- `word_count("Hello World")` returns `2`.
- `word_count("")` returns `0`.

## Validation

- For regression coverage, require exit code 0 from:

  ```sh
  python3 -m unittest
  ```
