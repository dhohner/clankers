# Host mechanisms

Use the selected host's interface after confirming its required capabilities.

## Claude Code

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
  - Inspect its tools for dispatch, identifiers, continuation, working directory, and concurrency.
  - Tool names depend on the extension.
- The bundled subagent example launches each child with `--no-session` and exposes no continuation interface for that child.
  - Report its missing continuation capability during preflight.
- Use the integration's persistent agent or session identifier as `agent_id`.
  - A tool that launches a new child for every call does not provide continuation.
- Select model and thinking settings only when the integration supports them.
  - Otherwise, record inherited values.
- Ask questions through visible conversation text unless an extension's question tool lets scheduling continue.

## Invocation examples

After loading or installing the skill, use the current host's command:

| Host | Request |
| --- | --- |
| Claude Code | `/task-executor:orchestrate with concurrency limit 1` |
| Codex | `$task-executor:orchestrate with concurrency limit 1` |
| Pi coding agent | `/skill:orchestrate with concurrency limit 1` |

On Pi, load the skills:

```sh
pi --skill <repository>/plugins/task-executor/skills
```

Configure the agent integration through its documented setup.
Loading the skills does not supply subagent tools.

For evals, invoke the named skill through the current host and preserve the scenario arguments.
