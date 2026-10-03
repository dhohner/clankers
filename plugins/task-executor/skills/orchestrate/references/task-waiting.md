# Waiting and answers

Return to scheduling after each result or answer.

## Wait for an answer

Apply these shared rules to stops, final gaps, and landing resolution or validation questions:

1. Preserve the latest `implemented` reply and verifier report, when present.
2. Build the question payload for its reason using the sections below.
3. Set status to `waiting` and persist `waiting` in `run.json` before asking.
4. Ask the user, naming the task file and affected items.
5. Return to scheduling without waiting synchronously for the answer.

### Stops and final gaps

Use these payload and question rules only for stops and final gaps:

- For a stop, include the task file, affected item, question, options with consequences, and recommendation.
- For a stop, repeat the question, options, consequences, and recommendation, and offer ending without a commit.
- For final gaps, include the task file and every gap's affected item, location, missing behavior or defect, and evidence.
- Display every final gap.
- Offer accepting each gap and committing this result, or continuing with instructions to the original agent.
  - Record accepted gaps as accepted.
- Explain that continuing final gaps starts a new round with the full verification limit.
- Offer ending either wait without a commit.
  - Keep the task file `pending`, retain its worktree and branch, and leave dependents unstarted.

### Landing questions

Use the landing conflict procedure's payload and accept, instruct, or end actions.
Apply this file's shared waiting steps and answer identity, persistence, clarification, and scheduling rules.

## Handle an answer

Identify the task from its question before acting.
Clarify answers that are ambiguous, lack a required decision or continuation instruction, or identify no single waiting task.
Keep the task `waiting` during clarification.

Record the user's answer and question in `answers` before dispatch.
For landing answers, use the landing conflict procedure's actions.
Use the stop and final gap handlers below only for those question reasons.

Require explicit acceptance of each final gap before committing it.
Persist every new stop or final gap before asking again.
An accepted gap does not authorize a later gap that differs from it.

### Continue a stop

- Clear `waiting`, set `running`, and persist.
- Send the answer instruction to the recorded `agent_id` with the decision and affected item.
- Handle the next reply and verify any `implemented` result.

### Continue final gaps

- Clear `waiting`, set `running`, reset `passes_used` to 0, increment `verification_round`, and persist.
- Send `answer` to the same agent with the user's instruction and full gap report.
- Handle its reply and verify with the full pass limit.

### Accept final gaps

- Record every explicitly accepted gap with disposition `accepted` in the ledger and `accepted_gaps`.
  - Include its evidence and the user's decision.
- Send `answer` to the same agent with the acceptance.
  - Ask it to record the decision and return `implemented` without further changes.
- Keep the task `waiting` until that reply arrives.
  - This acknowledgment creates no new implementation work.
- For `implemented` with unchanged implementation and uncovered items, commit and land.
  - Use that reply and the accepted coverage map.
- For a new `stop`, ask about that stop.
- If implementation or uncovered items change, clear the pending acceptance and set `running`.
  - Verify in a new full round before committing.
- Keep accepted gaps labelled `accepted` in `run.json`.

### End a wait

- Send `end` to the same agent.
- Clear `waiting` only after its `ended` reply and persist `ended`.
- A landing wait also retains its resolution worktree and validation attempt history.
- Propagate `not_started` to queued dependents through the scheduler.
