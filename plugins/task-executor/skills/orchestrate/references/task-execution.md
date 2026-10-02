# Task execution and verification

## Run one task

### Start

1. Create the task worktree and a new task branch from the integration branch's current tip:

   ```sh
   git worktree add -b <task branch> <task worktree> <integration branch>
   ```

2. Choose the model and effort, then record the choice and reason.
3. Set the run status to `running`, record the worktree and the branch, and update `run.json`.
4. Start a fresh subagent with the task subagent prompt.
   - Record its platform identifier in `agent_id` and retain it for every later instruction.
   - Initialize `verification_round` to 1 and `passes_used` to 0.
   - Use the host interface selected during preflight for dispatch and later instructions.

### Handle the reply of the task subagent

Read the `Message:` line of the reply.

- For `stop`, record the task file, `Question`, `Item`, `Options`, and `Recommended`, then wait for an answer.
- For `implemented`, start [verification](#verify).
- For any other reply, record it and end the task.

### Verify

For each `implemented` reply, start a fresh verifier in the task worktree using the verifier prompt.
Fill it from that reply and count one pass.
For the scope of verification, see [Verification limits](#verification-limits).

Full coverage requires no gaps and `covered` for every `Required behavior` and `Acceptance` item.
A `blocked` item is uncovered and names a blocker that further passes cannot remove.

| Report | Action |
| --- | --- |
| Full coverage | Record the coverage map, decision ledger, gap dispositions, and blocked behavior, then commit and land. |
| Any blocked item | Record the blocked behavior and gaps, then end the task with reason `blocked`. |
| Gaps, no blocked item, passes remain | Send `gaps` to the same task subagent and handle its reply. |
| Gaps, no blocked item, last pass | Record the coverage, ledger, gap dispositions, and gaps, then wait for an answer. |

Increment `passes_used` for every verifier pass and persist it in `run.json`.
A continuation after final gaps resets `passes_used` to 0 and increments `verification_round`.
The configured pass limit applies in full again.

## Verification limits

Each verifier checks one task in its own worktree.
The skill does not run the `Validation` commands on the integration branch after a landing.
Two parallel tasks that apply cleanly and break each other both reach `done`.

During integration review, run the task validation on that branch.
