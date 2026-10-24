# Brief mode intake

Build the source ledger from the prompt, prior conversation, and referenced files.
Capture actors, outcomes, behavior, acceptance examples, scope, exclusions, dependencies, constraints, evidence requirements, and stated uncertainty.
Include binding technologies, architecture decisions, security boundaries, operational requirements, and verification environments when supplied.
Treat extracted decisions as settled.

## Resolve missing decisions

Ask when competing answers would materially change scope, behavior, acceptance, dependencies, ownership, rollout risk, or the slice breakdown.
For infrastructure, consider deployment scope, supported execution environments, trust, authorization, bootstrap ownership, state handling, and approval policy where relevant.
Batch related questions into a concise round, using `ask_question` with useful options when available.

Record uncertainty that leaves the ticket set stable as an assumption or open question.
Leave unsupported naming rules, quotas, deduplication behavior, permission exceptions, and recovery flows unresolved unless the source or relevant repository evidence implies them.

Proceed to drafting once slices, dependencies, and acceptance boundaries are stable.
If a missing decision prevents that, ask the smallest blocking question and pause.
