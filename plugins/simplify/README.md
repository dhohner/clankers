# Simplify Plugin

Applies safe, behavior-preserving cleanup guidance for existing code so refactors stay small, reviewable, and low risk.

## What It Does

Claude automatically uses this skill for cleanup and simplification requests. Improves existing code with:

- Better readability and maintainability
- Reduced duplication and unnecessary complexity
- Small, behavior-preserving refactors where confidence is high
- Clear separation between safe automatic fixes and risky follow-up ideas

## Usage

```text
"Simplify this component without changing behavior"
"Clean up the files from the last commit"
"Refactor these staged changes for readability and less duplication"
```

Claude will focus on safe cleanup work and avoid broad rewrites or semantic changes unless explicitly requested.

## Learn More

See [the skill definition](./skills/simplify/SKILL.md) for the full workflow and decision rules.

## Authors

[dhohner](https://github.com/dhohner)
