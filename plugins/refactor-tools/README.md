# Refactor Tools Plugin

Packages safe, behavior-preserving cleanup and refactor workflows for existing code.

## What It Does

The included `simplify` skill handles cleanup and simplification requests. It improves existing code with:

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

The agent will focus on safe cleanup work and avoid broad rewrites or semantic changes unless explicitly requested.

## Learn More

Current bundled skill:

- `simplify`

See [the skill definition](./skills/simplify/SKILL.md) for the full workflow and decision rules.

## Authors

[dhohner](https://github.com/dhohner)
