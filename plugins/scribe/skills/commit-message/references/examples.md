# Message examples

## Delegated protocol

The patch gives implement a delegated prompt and message protocol.
The message shows the prompt fields and exchanges that define the new contract.

```text
feat(implement): add delegated mode for orchestrators

Implement handles a task directly and asks the user for missing input.
A delegated prompt supplies the task and working directory instead:

  Mode: delegated
  Task file: <path>
  Working directory: <path>

  orchestrator -> implement: prompt
  implement -> orchestrator: stop | implemented
  orchestrator -> implement: gaps | answer | end
  implement -> orchestrator: implemented | stop | ended

In delegated mode, implement leaves the task file unchanged and
returns control without asking the user or making a commit.
```

## Retry state transition

The patch stops automatic retries when a delivery reaches its attempt limit.
The message shows the changed transitions and the terminal-state boundary.

```text
fix(delivery): stop retrying after the attempt limit

Failed deliveries stayed eligible for retry after the attempt limit.
The final failed attempt now marks the delivery as exhausted:

  pending -> sending -> delivered
                 |
                 +----> pending    below the attempt limit
                 +----> exhausted  at the attempt limit

Exhausted deliveries are no longer selected for automatic retry.
```
