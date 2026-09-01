# Refactor Tools Plugin

Packages safe, behavior-preserving cleanup, refactor, and review workflows for existing code.

## What It Does

The `simplify` skill handles cleanup and simplification requests. It improves existing code with:

- Better readability and maintainability
- Reduced duplication and unnecessary complexity
- Small, behavior-preserving refactors where confidence is high
- Clear separation between safe automatic fixes and risky follow-up ideas

The `review-changes` skill judges a change set instead of editing it. It reports:

- One score from 1 to 10 for quality, security, simplicity, robustness, scalability, and maintainability
- Findings ordered by importance, each with a location, a concrete cost, and a fix
- A split between findings observed by running a command and findings inferred from reading
- The validation commands that ran, and the risks that stayed untested

The `tighten-prose` skill shortens AI-generated prose in staged changes, named paths, or commit ranges without changing meaning.

## Usage

`simplify` runs on its own when the request matches:

```text
"Simplify this component without changing behavior"
"Clean up the files from the last commit"
"Refactor these staged changes for readability and less duplication"
```

`review-changes` runs for matching review requests, direct invocation, or independent review from another skill:

```text
/refactor-tools:review-changes
/refactor-tools:review-changes the change implements the attached task description
"Review my staged changes before I commit"
```

`tighten-prose` runs only by direct invocation:

```text
/refactor-tools:tighten-prose
/refactor-tools:tighten-prose docs/ main..HEAD
```

## Learn More

Current bundled skills:

- `simplify` - see [the skill definition](./skills/simplify/SKILL.md)
- `review-changes` - see [the skill definition](./skills/review-changes/SKILL.md)
- `tighten-prose` - see [the skill definition](./skills/tighten-prose/SKILL.md)

## Authors

[dhohner](https://github.com/dhohner)
