# Model selection and capability requirements

## Model and effort

Apply the [model permission policy](#model-permission-policy) before choosing the platform's model and effort for the task.
"Stronger" means the strongest available model within the default cap or the user's explicit permission for this run.

| Task | Model | Effort |
| --- | --- | --- |
| Changes a security boundary, persisted data, a public contract, concurrency, or many files | Stronger | High |
| Has many interacting `Required behavior` items | Stronger | High |
| Has few items in known files | Standard | Medium |
| Is mechanical, such as renaming or editing documentation | Standard | Low |

Record the selected and used model and effort in `run.json`.
If the platform cannot set a subagent's model or effort:

- Retain the selected value.
- Record the parent's value as used only after confirming it satisfies the model permission policy.
- If the inherited model is unknown, stop and ask for an allowed model before dispatch.

## Model permission policy

Default selection is capped at Claude Opus 5.5 or GPT 6.1.
Use a standard model for simpler tasks as specified above.
Claude Fable, GPT Astra, and models above the default cap require explicit user permission before dispatch.
This policy covers task agents, fresh verifiers, capability probes, repair agents, and agents used to resolve conflicts.

- Resolve the exact provider model ID through the interface's documented model catalog.
  - Check aliases and variants against the same cap and restrictions.
  - An alias does not grant permission.
  - If the catalog does not establish whether a model is allowed, ask the user before using it.
- Task complexity and high effort do not authorize a restricted model.
  - General orchestration requests and permission from earlier runs do not authorize a restricted model.
  - Require permission that identifies the model or model family allowed for the current run.
- Before every dispatch or continuation, confirm the actual model, including an inherited parent model, is allowed.
  - Configure an allowed model when the interface supports it.
  - If overriding a restricted inherited model is unsupported, stop and ask for permission or an allowed parent model.
- If no allowed model is available, stop and ask the user.
  - Do not silently substitute a restricted model.
- Record explicit permission in `run.json` under `model_permissions` before using it.
  - If permission precedes run preparation, retain it in conversation context and copy it into the initial run file.
  - Verify the reported model after dispatch when the interface exposes it.
  - If it differs from the authorized selection and violates this policy, stop further work and report the mismatch.

## Platform mechanisms

Choose mechanisms from the current host and its exposed tool schemas.
The model provider does not identify the host.
Pi and Codex can use Claude models without Claude Code tools.

Before dispatch, inspect the selected interface's documentation and use only exposed tools and supported parameters.

Before preparing a run, confirm the interface can:

- Let task agents discover and load installed `implement` and `tdd` skills in their worktrees.
- Start independent task agents and fresh verifier agents in specified working directories.
- Return a stable identifier and deliver later instructions to that same task agent with its context.
- Run agents concurrently while a user question remains open.
  - Let the orchestrator handle results and land independent tasks during the wait.

If a required interface is absent or explicitly lacks these capabilities, stop preflight.
Name the missing capability and required setup.
Require user authorization before creating branches or worktrees, substituting sequential execution, or installing an extension.

Test untested exposed capabilities before preparing the run.
Record only observed failures as platform limits.
