---
depends_on: []
state: pending
---

# Select value two

## Outcome

The settings select value 2.

## Required behavior

- Set `VALUE` in `settings.py` to 2.

## Boundary

- May change: `settings.py`.
- Must preserve: `FEATURES`.

## Acceptance

- `VALUE` equals 2.

## Validation

```sh
python3 -c "from settings import VALUE; assert VALUE == 2"
```
