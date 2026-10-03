---
depends_on: [02-second.md]
state: pending
---

# Complete the dependent marker

## Outcome

A marker records that the second task landed.

## Required behavior

- Create `dependent.txt` containing `done` and a newline.

## Boundary

- May change: `dependent.txt`.

## Acceptance

- `dependent.txt` reads `done` and a newline.

## Validation

```sh
python3 -c "from pathlib import Path; assert Path('dependent.txt').read_text() == 'done\n'"
```
