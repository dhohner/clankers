# Host mechanisms

Use the selected host's interface after confirming its required capabilities.

## Claude Code

- Give task agents the `Skill` tool to load `task-executor:implement` and `task-executor:tdd`.
- Use the available Claude Code agent interface, reading its schema before dispatch.
  - If it exposes `Agent`, set `model` when supported.
  - Set effort only if the interface accepts it.
  - Otherwise, record the inherited effort.
- Start the subagents of all ready tasks in one message so they run at once.
- Send `gaps`, `answer`, and `end` through the exposed continuation interface to the original agent identifier.
  - If this is `SendMessage` and it is deferred, load its schema through `ToolSearch` when available.
  - Confirm that the interface retains context after the agent returns a reply.
- If the interface offers `isolation`, leave it unset because `git worktree add` creates the task worktree.

## Codex

- Give task agents access to the installed skills `$task-executor:implement` and `$task-executor:tdd`
- Start one subagent per task with the Codex session's subagent tools.
  - Send later `gaps`, `answer`, and `end` instructions to the original agent identifier.
  - Resume it if the tool requires resumption.
  - If it loses context after a reply, record and report the observed platform limit.
- Set the model and the effort when the tool accepts them.
- Task and verifier agents start no subagents, so the interface needs only one nesting level.
- Check sandbox write rules and required approvals for the worktree root and `.git` in the fixture.

## Pi coding agent

- Pi's built-in tools do not provide subagents.
  - Use an already configured extension or integration only when its documented interface meets the required agent capabilities.
  - Inspect its tools for dispatch, identifiers, continuation, working directory, concurrency, and child skill discovery.
  - Configure child sessions to discover installed `implement` and `tdd` skills through the integration's supported setup.
  - Tool names depend on the extension.
- The bundled subagent example launches each child with `--no-session` and exposes no continuation interface for that child.
  - Report its missing continuation capability during preflight.
- Use the integration's persistent agent or session identifier as `agent_id`.
  - A tool that launches a new child for every call does not provide continuation.
- Select model and thinking settings only when the integration supports them.
  - Otherwise, record inherited values.
- Ask questions through visible conversation text unless an extension's question tool lets scheduling continue.

### pi-subagents

Install task executor as a Pi package so both parent and child sessions can discover its skills.
The package declares `orchestrate-worker` for pi-subagents and selects the installed `implement` and `tdd` skills by name.
Before dispatch, inspect capabilities:

```js
subagent({ action: "list", options: { capabilities: true } })
```

A capabilities listing establishes declared configuration.
Test continuation and scheduling with the waiting fixture before treating them as supported.

For launch preflight, use `resolveSubagentLaunchContract` from the installed integration's `pi-subagents/preflight` API, following its documented inputs.
Pass these inputs:

- The intended agent, task prompt, and working directory.
- Explicit fresh context and the selected model.
- Applicable host model and capability restrictions.
- `intercomBridge: { mode: "off" }`, matching the launch's `options.intercomBridge` value for both workers and verifiers.

Inspect `contract.agent`, `contract.skills.resolved`, and `contract.tools.effectiveAllowlist`.
`ok: true` alone does not prove this workflow's requirements.
Require `contract.intercomBridge.mode === "off"` and `contract.intercomBridge.active === false`.
Exclude `contact_supervisor` from the effective tool allowlist.
Stop before dispatch if the resolved bridge state or tools violate these requirements.

An active bridge instructs children to ask the supervisor and remain alive.
This prevents a worker's final `stop` reply from releasing its scheduler slot and keeps verifier questions out of the final report.
If the host cannot expose that API or an equivalent resolved contract, stop and report the missing preflight capability.

- Dispatch task prompts to `orchestrate-worker`.
  - Set `async: true`, `cwd` to the task worktree, `options.context: "fresh"`, and `options.intercomBridge: { mode: "off" }`.
  - Omit managed worktree isolation from the launch because the orchestrator creates the worktree.
  - Use launch preflight to require both selected skills to resolve for the child's working directory.
  - pi-subagents otherwise warns about missing skills and continues.
  - Stop before creating run resources if either skill is missing, disabled, or unavailable to children.
- Dispatch each canonical verifier prompt to a fresh `orchestrate-verifier`.
  - Set `async: true`, `cwd` to the task worktree, `options.context: "fresh"`, and `options.intercomBridge: { mode: "off" }`.
  - Before dispatch, use the integration's launch preflight for the selected model and working directory.
  - Confirm the resolved agent source, effective tools, context, and skill dependencies.
  - Require `read` and `bash`, and exclude `edit`, `write`, and `subagent`.
  - Require instructions to run safe validation while preserving the working tree.
  - Inspect the resolved profile and any user or project overrides.
  - A capabilities listing alone cannot establish that its instructions permit validation.
  - Stop and report a missing, disabled, shadowed, or incompatible verifier before dispatch.
  - Follow the verifier prompt's instruction to preserve the working tree and make no edits.
  - Inspect validation commands for side effects and report unsafe commands as blocked because shell access does not enforce preservation.
  - Task workers and verifiers start no subagents.
- Select the exact permitted model through the extension's model catalog.
  - Set effort through the launch's `model` suffix, such as `provider/model-id:high`.
  - A separate dispatch `thinking` field does not set native child effort.
  - The launch selection overrides defaults from settings and agent overrides.
- Record the original task run identifier as `agent_id`.
  - After a completed task reply, inspect that run's status.
  - Send `gaps`, `answer`, or `end` with `action: "resume"`, the retained run identifier, and `message` containing the instruction.
  - Resume restores the stored conversation and contract and can return a new run identifier.
  - Track the latest continuation identifier separately and use it for the next resume.
  - Preserve the original `agent_id` in `run.json`.
  - Check the retained model against the model permission policy before every continuation.
  - Resume does not accept a replacement model.
  - Treat a failed resume as a platform limit and follow the waiting rules.
  - Do not start a fresh worker for that answer.
- Handle each final `Message: stop` reply through the orchestrator's waiting rules.
  - Keep scheduling independent tasks while the user decides.
  - Use the extension's async completion notifications to handle subsequent replies.

## Invocation examples

After loading or installing the skill, use the current host's command:

| Host | Request |
| --- | --- |
| Claude Code | `/task-executor:orchestrate with concurrency limit 1` |
| Codex | `$task-executor:orchestrate with concurrency limit 1` |
| Pi coding agent | `/skill:orchestrate with concurrency limit 1` |

For evals, invoke the named skill through the current host and preserve the scenario arguments.
