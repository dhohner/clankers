# Model selection and capability requirements

## Model and effort

Choose the platform's model and effort from the task's content:

| Task | Model | Effort |
| --- | --- | --- |
| Changes a security boundary, persisted data, a public contract, concurrency, or many files | Stronger | High |
| Has many interacting `Required behavior` items | Stronger | High |
| Has few items in known files | Standard | Medium |
| Is mechanical, such as renaming or editing documentation | Standard | Low |

Record the selected and used model and effort in `run.json`.
If the platform cannot set a subagent's model or effort:

- Retain the selected value.
- Record the parent's value as used, or `parent` if that inherited value is unknown.

## Platform mechanisms

Choose mechanisms from the current host and its exposed tool schemas.
The model provider does not identify the host.
Pi and Codex can use Claude models without Claude Code tools.

Before dispatch, inspect the selected interface's documentation and use only exposed tools and supported parameters.

Before preparing a run, confirm the interface can:

- Start independent task agents and fresh verifier agents in specified working directories.
- Return a stable identifier and deliver later instructions to that same task agent with its context.
- Run agents concurrently while a user question remains open.
  - Let the orchestrator handle results and land independent tasks during the wait.

If a required interface is absent or explicitly lacks these capabilities, stop preflight.
Name the missing capability and required setup.
Require user authorization before creating branches or worktrees, substituting sequential execution, or installing an extension.

Test untested exposed capabilities before preparing the run.
Record only observed failures as platform limits.
