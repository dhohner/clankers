---
name: next-thing
description: Prioritize the single highest-leverage product bet for the current project and pitch it with repository evidence. Use when the user asks what to build next or requests an elevator-pitch product recommendation.
---

# Next Product Bet

Choose the one product addition most likely to create a step-change in user value or product momentum.

## Process

1. **Ground the product.**
   Inspect product documentation, user-facing workflows, recent history, open plans, architecture, and tests as available.
   Infer the likely users, current promise, maturity, momentum, and unmet friction from concrete repository signals.
   If audience or decision horizon would materially change the ranking and cannot be inferred, ask one short round of questions; otherwise default to product and engineering leaders choosing the next near-term addition.
   This step is complete when every claim that will affect the ranking has repository support and meaningful uncertainty is identified.

2. **Build a real portfolio.**
   Develop exactly three product bets, each aimed at a distinct user problem or bottleneck and each tied to a concrete user outcome.
   This step is complete when all three differ in both target problem and proposed addition.

3. **Pick the bet.**
   Compare the candidates on user value, evidence strength, strategic fit, delivery tractability, and sequencing leverage.
   Favor overall product leverage over delivery ease.
   This step is complete when the winner has a repository-backed reason to beat each alternative now and all three candidates are ranked.

4. **Pitch the recommendation.**
   Apply every evidence and voice rule below, then use the output format.
   This step is complete when the pitch names the user pain, proposed addition, timing, tradeoff, and confidence, with every material claim grounded in the repository.

## Evidence and Voice

- Lead with the bet so the opening works as a standalone elevator pitch.
- Express repository evidence solely as product capabilities, journeys, gaps, and constraints.
- Use crisp, spoken Senior PM language that is decisive, commercially aware, and specific.
- Keep the recommendation at product altitude unless the user requests implementation detail.
- Express uncertainty precisely without weakening a conclusion the evidence supports.
- Make "why now" about current momentum, pain removed, sequencing unlocks, or risk reduced.

## Output

Use this format unless the user requests another.

```text
**The bet:** [One-sentence recommendation.]

[Two or three sentences naming the user problem, proposed addition, and why the timing is right.]

**Why now**

- [One sentence grounded in the current product shape or momentum.]
- [One sentence tied to user pain or opportunity.]
- [One sentence about what this unlocks or de-risks next.]

**Runner-up:** [One sentence naming the strongest alternative and why it loses to the bet right now.]

**Confidence:** [high | medium | low] - [One sentence naming the decisive evidence or uncertainty.]
```

Use `high` only when multiple independent signals converge, `medium` when the recommendation depends on a bounded inference, and `low` when a key product assumption remains unresolved.

After delivering the recommendation, ask whether the user wants it expanded into a PRD.
Use an interactive question tool when available, with options such as "Yes, write the PRD" and "No, keep the recommendation."
If the user agrees, invoke `to-prd` with the recommendation as initial context.
