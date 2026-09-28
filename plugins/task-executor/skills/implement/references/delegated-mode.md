# Delegated mode

The orchestrator's prompt names the task file in its working tree and the working directory for task changes.
Apply these constraints throughout the steps below:

- Read the named task file as the contract; preserve every byte, including its `state`.
- Change files only in the given working directory; use its `HEAD` and existing changes as the selection baseline.
- Keep scratch files, such as mutation check backups, inside the working directory, and remove them before each reply.
- Work within this subagent; never ask the user, start a subagent, run a verifier, or make a commit.
- Where normal mode would ask the user or stop, return a `stop` message.
  - Wait for the next instruction without further edits.

## Select the task

Return a `stop` message for a missing required section.
Otherwise, follow [Select and gate the task](shared-rules.md#select-and-gate-the-task) for the named task until its completion criterion holds.

## Implement the task

Follow [Implement with TDD](shared-rules.md#implement-with-tdd) in the working directory.
Continue through all unblocked checks and validation commands before replying, unless a decision gate requires a `stop` message.

Return an `implemented` message once every unblocked check has red-green evidence or a recorded manual result and every `Validation` command has run.
Wait for the next instruction.

## Handle instructions

Handle each orchestrator instruction by its first line:

- `Instruction: gaps` lists verifier gaps and prior rejected gaps with their evidence.
  - Apply [Gap dispositions](shared-rules.md#gap-dispositions) to every gap, then return a new `implemented` message.
  - Return a `stop` message instead for a gap that exposes an unresolved material decision.
- `Instruction: answer` contains the user's decision for the open stop.
  - Record the decision in the ledger and resume from the stop.
  - Return the next `implemented` or `stop` message.
- `Instruction: end` ends the task.
  - Make no further edits, and return an `ended` message.

Delegated work is complete when the last reply is an `ended` message, or the orchestrator sends no further instruction.

## Reply format

Reply with only one message as plain text, without a code fence, with its `Message:` line first.

`stop` message:

```text
Message: stop
Task file: <task file path>
Item: <affected Required behavior or Acceptance item, or the missing section>
Question: <question>
Options:
- <option>: <consequence>
- <option>: <consequence>
Recommended: <option, or "None">
```

`implemented` message:

```text
Message: implemented
Changed files:
<changed file paths>
Checks:
<check -> item: red and green evidence, or manual result>
Validation:
<command: result>
Decision ledger:
<ledger, or "None">
Blocked behavior:
<behavior and its blocker, or "None">
Gap dispositions:
<gap: disposition and rationale, or "None">
```

`ended` message:

```text
Message: ended
Task file: <task file path>
The task made no further edits.
```
