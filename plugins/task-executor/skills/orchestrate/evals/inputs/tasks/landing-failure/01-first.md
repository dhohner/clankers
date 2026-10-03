---
depends_on: []
state: pending
---

# Select value one

## Outcome

The settings select value 1.

## Required behavior

- Set `VALUE` in `settings.py` to 1.

## Boundary

- May change: `settings.py`.
- Must preserve: `FEATURES`.

## Acceptance

- `VALUE` equals 1.

## Validation

```sh
python3 -c "from settings import VALUE; assert VALUE == 1"
```
