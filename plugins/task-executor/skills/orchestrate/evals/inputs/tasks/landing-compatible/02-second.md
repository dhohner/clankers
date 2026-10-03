---
depends_on: []
state: pending
---

# Add the second feature

## Outcome

The settings enable feature `two`.

## Required behavior

- Add `two` to `FEATURES` in `settings.py`.

## Boundary

- May change: `settings.py`.
- Must preserve: existing features and `VALUE`.

## Acceptance

- `FEATURES` contains `two`.

## Validation

```sh
python3 -c "from settings import FEATURES; assert 'two' in FEATURES"
```
