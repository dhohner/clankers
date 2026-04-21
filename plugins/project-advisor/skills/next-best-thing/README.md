# next-best-thing

Identify the single most valuable next addition to the current project and present it like a Senior Product Manager's recommendation.

## What it does

This slash command analyzes your repository — reading key files, recent commits, and architecture — then recommends the **one** highest-leverage improvement you could make right now.

The recommendation stays evidence-backed, but the delivery is intentionally more human: a short product pitch you could say in a planning meeting, send in Slack, or use to align the team on the next bet.

## Output

- **The bet** — one-sentence headline
- **Pitch paragraph** — 3-5 spoken-tone sentences covering the user problem, the proposed addition, repo evidence, and the key tradeoff
- **Confidence** — high / medium / low with brief calibration

## Usage

Run `/next-best-thing` in Claude Code or compatible plugin hosts to get a tailored recommendation for any project.
