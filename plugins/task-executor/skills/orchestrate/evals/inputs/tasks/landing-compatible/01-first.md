---
depends_on: []
state: pending
---

# Add the first feature

## Outcome

The settings enable feature `one`.

## Required behavior

- Add `one` to `FEATURES` in `settings.py`.

## Boundary

- May change: `settings.py`.
- Must preserve: existing features and `VALUE`.

## Acceptance

- `FEATURES` contains `one`.

## Validation

```sh
python3 -c "from settings import FEATURES; assert 'one' in FEATURES"
```

Manual verification: inspect the enabled features.
