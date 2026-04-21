---
name: next-best-thing
description: Identify the single highest-leverage next addition to the current project and present it as a crisp, evidence-backed product recommendation in the voice of a Senior Product Manager. Use this whenever the user asks what to build next, what opportunity to prioritize, what the strongest product bet is, or wants a recommendation that feels like an elevator pitch rather than an implementation plan.
disable-model-invocation: true
---

# Next Best Thing

Analyze the current project and identify the single addition that would create the clearest step-change in user value or product momentum.

The recommendation must be evidence-backed. Base it on concrete signals from the repository, not generic product advice.

The output should feel like it came from a strong Senior Product Manager:

- crisp, confident, and commercially aware
- grounded in the repo, not in generic product tropes
- persuasive enough to say out loud in a meeting or paste into Slack
- specific about the user problem, the unlock, and why this is the best bet right now

**Gathering user input**: Whenever you need answers from the user, prefer an interactive question tool over writing questions as plain chat messages. Many harnesses provide one (e.g. `vscode_askQuestions` in VS Code, or similar). If such a tool is available, use predefined options where sensible and allow multi-select when applicable. If no dedicated tool exists, fall back to a concise numbered list in the chat.

If the intended audience or decision context is unclear and it would materially change the recommendation, ask a short round of questions. Otherwise default to speaking to a product and engineering leadership audience.

## Voice and Framing

- Lead with the bet, not with a summary of your analysis.
- Make the first paragraph work as a standalone elevator pitch: 3-5 sentences someone could say out loud.
- Sound human. Prefer natural phrasing over template-like labels and avoid stock AI language such as "based on the analysis", "leveraging", "synergy", "innovative solution", or "in conclusion".
- Tie the recommendation to a concrete user pain, business opportunity, or workflow bottleneck.
- Balance conviction with judgment. A Senior Product Manager sounds decisive without pretending the evidence is perfect.
- Keep the answer tight. The user should quickly understand the bet, why now, and what tradeoff they are making.
- Stay at product altitude unless the user explicitly asks for implementation detail.
- Translate repo observations into product language. The analysis step reads files, directories, and code — the output talks about capabilities, user journeys, and gaps. Never surface file names, paths, function names, or other implementation artifacts in the recommendation. Instead of "I see `setup.mdx` and `checklist.mdx`", say "the onboarding content covers prerequisites and verification but presents them as static checklists, not a guided flow."

## Process

1. Understand the project by reading the repository structure and key project files.
2. Collect evidence about product shape, maturity, missing capabilities, and likely users before proposing anything.
3. Shortlist 2-3 genuinely distinct additions — not variations of the same idea. Push yourself past the first plausible option. A good shortlist has candidates that serve different user problems or attack different bottlenecks, so the final choice is a real tradeoff, not an obvious winner.
4. Pick one. Choose based on user value, strategic fit, feasibility, and narrative clarity. The recommendation should win because it is the strongest bet right now, not because it was the first thing that came to mind.
5. Explain why now in terms of momentum: what this unlocks next, what pain it removes, or what decision it de-risks.
6. Be explicit about uncertainty when the evidence is incomplete.
7. After presenting the recommendation, offer to turn it into a PRD using the `write-a-prd` skill. A recommendation on its own captures the _what_ and _why_ at a high level, but a PRD fleshes it out into something the team can refine and commit to.

   Use the interactive question tool (if available) to ask the user whether they'd like to proceed. Offer predefined options such as "Yes, write a PRD for this" and "No, just the recommendation". If they agree, invoke the `write-a-prd` skill, passing the recommendation as initial context so the user doesn't have to repeat themselves. If they decline, confirm the recommendation and wrap up.

## Output Format

Default to this structure unless the user asks for a different format:

```text
The bet
[One sentence recommendation — the kind of headline a Senior PM would put at the top of a planning doc.]

[2-3 sentences. This is the elevator pitch. It names the user problem, states what we should build, and says why the timing is right. Keep it short enough to say out loud or paste into Slack. No file names, no code references — product language only.]

Why now
- [reason grounded in current product shape or momentum]
- [reason tied to user pain or opportunity]
- [reason about what this unlocks or de-risks next]

Runner-up: [One sentence naming the strongest alternative and why it loses to the bet right now. This should be a genuinely different idea, not a weaker version of the winner.]

Confidence: [high | medium | low — one sentence calibration]
```

The elevator pitch and the "Why now" bullets are the core of the output. Together they should let the reader understand the bet without scrolling. Keep each bullet to one sentence — these are reasons, not mini-paragraphs.

### Example (for tone only — do not copy the content)

> **The bet**: Add a shared credential-rotation workflow so teams stop hand-rolling expiry logic per service.
>
> Every service manages its own credential lifecycle, and three of them have had silent failures from expired tokens in the last two months. A thin shared module that owns rotation, expiry notifications, and audit logging would eliminate that entire class of bug and give the security team one place to enforce policy.
>
> **Why now**
>
> - Recent incidents show the per-service approach is already breaking down at current scale.
> - Every new service added multiplies the risk; this gets cheaper the sooner it ships.
> - Removing credential bugs unblocks the team's push toward automated deployments.
>
> Runner-up: A cross-service health dashboard — useful, but it monitors symptoms while rotation prevents them.
>
> Confidence: high — the pattern is clear across multiple services and the scope is bounded.
