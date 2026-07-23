# Brief Mode Intake

The goal is stable ticket slices, not a reconstructed PRD.

## Extract before asking

Build the initial source ledger from the prompt, prior conversation, and referenced files.
Capture:

- actors and desired outcomes
- settled behavior and acceptance examples
- scope boundaries and non-goals
- rollout, migration, deadline, policy, or compliance constraints
- dependencies on existing systems or workflows
- assumptions, risks, and open questions already stated

Treat extracted facts as settled and spend questions only on missing decisions.

## Question threshold

Ask when competing answers would materially change scope, behavior, acceptance criteria, dependencies, ownership, rollout risk, or the slice breakdown.
Typical high-impact ambiguities include personal versus shared ownership, limited versus broad rollout, automatic versus manual behavior, migration needs, prerequisite approvals, and extending an existing workflow versus adding a separate management surface.
Batch related questions into one concise round, using `ask_question` with useful predefined options when available.

When a ticket set remains stable without an answer, record the uncertainty as an assumption or open question.
Leave unsupported naming rules, quotas, deduplication behavior, permission exceptions, and recovery flows unsettled unless the source or bounded repository context directly implies them.

## Stop asking

Proceed as soon as the source ledger supports stable outcome-oriented slices with credible dependencies and acceptance boundaries.
When one missing decision prevents a stable breakdown, ask the smallest blocking question and pause.

**Complete when:** every missing decision that could change the slices has either been answered or isolated as the pending blocker, while lower-impact uncertainty is explicitly recorded rather than silently settled.
