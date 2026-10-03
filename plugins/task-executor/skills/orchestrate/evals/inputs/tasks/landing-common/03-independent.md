---
depends_on: []
state: pending
---

# Complete the independent marker

## Outcome

The independent marker reads `done`.

## Required behavior

- Replace the contents of `independent.txt` with `done` and a newline.

## Boundary

- May change: `independent.txt`.

## Acceptance

- `independent.txt` reads `done` and a newline.

## Validation

```sh
python3 -c "from pathlib import Path; assert Path('independent.txt').read_text() == 'done\n'"
```
