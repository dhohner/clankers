---
agent: agent
name: next-best-thing
description: Identify the single most valuable and innovative addition to the current project
---

Analyze the current project and identify the **single smartest, most innovative, and most impactful addition** that could be made right now.

This is a brainstorming prompt, but the recommendation must be **evidence-backed**. Base it on concrete signals from the repository, not generic product advice.

**Process:**

1. **Understand the project** — Read key files (README, package.json, main entry points, recent commits) to build a clear picture of:
   - What the project does and who it's for
   - Its current capabilities and architecture
   - What problem it solves and how well it solves it today
   - What concrete signals in the repo point to current priorities, gaps, or momentum

2. **Collect evidence before proposing anything** — Ground your thinking in specific observations such as:
   - Existing features, missing pieces, or rough edges visible in the repo
   - Repeated patterns, TODOs, gaps in workflows, or signs of manual friction
   - Recent commits or structure that suggest where the project is actively evolving
   - Constraints implied by the current architecture, installation flow, or contributor experience

   Prefer direct evidence from the codebase over speculation. If something is uncertain, say so explicitly.

3. **Identify the opportunity space** — Consider:
   - Gaps between the current state and the ideal experience
   - High-leverage points where a small investment yields outsized value
   - What users or collaborators would find most surprising and delightful
   - What would unlock new use cases or meaningfully expand the project's reach

4. **Compare a few serious candidates** — Briefly consider 2-3 plausible additions, then choose the strongest one based on:
   - Strength of evidence from the repo
   - Leverage relative to implementation effort
   - Novelty without becoming detached from the current project
   - Fit with what the project already is trying to become

5. **Apply a sharp filter** — The final recommendation must be:
   - **Singular**: one focused addition, not a list
   - **Innovative**: non-obvious; not just "add tests" or "improve docs"
   - **Accretive**: builds on what exists rather than replacing or reworking it
   - **Feasible**: achievable with reasonable effort given the current codebase
   - **Evidence-backed**: justified by specific repo observations, not hand-wavy reasoning

6. **Be honest about uncertainty** — If the evidence is thin or ambiguous:
   - Say what is well-supported vs inferred
   - Avoid overstating confidence
   - Still make a recommendation, but calibrate the confidence to match the evidence

**Output Format:**

**The Recommendation:** [one sentence headline]

**Why this, why now:** [2–4 sentences explaining why this is the highest-leverage move at this exact moment in the project's trajectory]

**Evidence:** [3-5 concrete repo observations that support the recommendation]

**Alternatives considered:** [1-2 sentences on the strongest rejected alternatives and why they lost]

**What it would look like:** [concrete description of the feature/change — enough to act on]

**Expected impact:** [what changes for users or contributors once this exists]

**Confidence:** [high | medium | low, with one sentence explaining the main source of uncertainty if not high]
