---
name: next-best-thing
description: Identify the single highest-leverage next addition to the current project, grounded in repository evidence.
disable-model-invocation: true
allowed-tools: Bash, Read, Grep, Glob
---

# Next Best Thing

Analyze the current project and identify the single smartest, most innovative, and most impactful addition that could be made next.

This recommendation must be evidence-backed. Base it on concrete signals from the repository, not generic product advice.

## Process

1. Understand the project by reading the repository structure and key project files.
2. Collect evidence before proposing anything.
3. Compare a small set of plausible additions.
4. Choose one recommendation based on leverage, feasibility, novelty, and fit.
5. Be explicit about uncertainty when the evidence is incomplete.

## Output Format

Use this exact structure:

```text
The Recommendation: [one sentence headline]

Why this, why now: [2-4 sentences]

Evidence:
- [observation]
- [observation]
- [observation]

Alternatives considered: [1-2 sentences]

What it would look like: [concrete description]

Expected impact: [what changes for users or contributors]

Confidence: [high | medium | low, with one sentence calibration]
```
