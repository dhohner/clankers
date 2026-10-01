# Prompts and model choice

Resolve absolute paths before you fill a prompt.
`<implement skill file>` is the absolute path of `../implement/SKILL.md`, resolved from the directory of this skill.
`implement` has `disable-model-invocation: true`, so a subagent cannot load it through a skill tool and must read that file.

## Task subagent prompt

Send this prompt to a fresh subagent.
Keep the three mode lines as separate lines, exactly as written.

```text
Read <implement skill file> and follow its delegated mode.
Mode: delegated
Task file: <absolute path of the task file in the start working tree>
Working directory: <absolute path of the task worktree>
You are a subagent of an orchestrator.
Work alone: start no subagents, and reply with a `stop` message instead of asking the user.
Run every command in the working directory and edit only files under it.
Reply with one message in the delegated mode reply format.
```

The task file path points into the start working tree because the task worktree may lack files from the task directory.

## Verifier prompt

Use the canonical `implement` verifier prompt in [Verify requirement coverage](../../implement/references/normal-mode.md#verify-requirement-coverage).
Copy that code block unchanged and fill its placeholders.
Put these lines before it:

```text
Working directory: <absolute path of the task worktree>
You are a verifier subagent of an orchestrator.
Work alone: start no subagents, and put every open question in your report.
Run every command in the working directory.
```

Fill the placeholders from the latest `implemented` message:

- `<task file path>`: the absolute path of the task file in the start working tree.
- `<changed files>`: its `Changed files`.
- Decision ledger and blocked behavior: its `Decision ledger` and `Blocked behavior`.
- Prior rejected gaps: the gaps that earlier `implemented` messages rejected, with their evidence, or `None`.

## Instructions

Send instructions to the same task subagent, as plain text with the `Instruction:` line first.

```text
Instruction: gaps
Gaps:
<gap, location, and missing behavior or observed defect, one per gap>
Prior rejected gaps:
<gap, boundary evidence, and rationale, or "None">
```

```text
Instruction: answer
Task file: <task file path>
Item: <affected item or items>
Decision: <user's answer verbatim>
Context: <original stop, or final gaps with evidence>
Action: <resume from the stop; address the gaps; or record acceptance and return implemented without further changes>
```

```text
Instruction: end
```

## User questions

Post the question in the parent conversation while independent task agents keep working.
Keep handling their results, starting ready tasks, and landing commits before the user answers.
Use a platform question tool only if scheduling can continue during the wait.

Send a plain chat question as a visible text block before continuing scheduler tool calls.
Do not end the parent turn solely to ask while independent work is ready to start or land.
Name the task file to route later replies to its `agent_id`.

Ask in arrival order, using task prefix order for simultaneous stops.
Persist every waiting task even if another question is already open.
Label each question with its task file and affected item.

When several tasks wait, ask the user to name the task in each answer.
Route each answer by task identity.

For a stop, repeat the options with consequences and recommendation, and offer ending without a commit.
For final gaps, display the gaps and offer:

- Accept these gaps and commit this result, recording the gaps as accepted.
- Continue with an instruction to the original task agent, restarting verification with the full pass limit.
- End without a commit and leave dependents unstarted.
  - Keep the task `pending` and retain its worktree and branch.

## Platform limits

Check context retention and scheduling during questions on each platform with [the waiting fixture](waiting-fixture.md).
Keep the original agent available with its context for later instructions after each reply.
Do not close it while its task waits.

If context resumption fails, record the observed error or context loss in `run.json` under `platform_limits`.
Tell the user.
Keep the task `waiting` and its file `pending` for a rerun in a new worktree.

Do not silently replace the agent during a continuation.

If orchestration suspends until a user reply, record the scheduling limit and its evidence in `platform_limits`.
Tell the user.
Independent commits during a wait remain unverified or failed on that platform until a mechanism passes the fixture.

## Model and effort

Choose the platform's model and effort from the task's content:

| Task | Model | Effort |
| --- | --- | --- |
| Changes a security boundary, persisted data, a public contract, concurrency, or many files | Stronger | High |
| Has many interacting `Required behavior` items | Stronger | High |
| Has few items in known files | Standard | Medium |
| Is mechanical, such as renaming or editing documentation | Standard | Low |

Record the selected and used model and effort in `run.json`.
When a platform cannot set either value for a subagent, keep the selected value and record the parent's value as used.
Record `parent` when the inherited value is unknown.

## Platform mechanisms

Choose mechanisms from the current host and its exposed tool schemas.
The model provider does not identify the host.
Pi and Codex can use Claude models without Claude Code tools.

Read the selected interface's documentation before dispatch, and use only its supported parameters.
Do not assume tools named `Agent`, `SendMessage`, or `ToolSearch` exist on another host.

Before preparing a run, confirm the interface can:

- Start independent task agents and fresh verifier agents in specified working directories.
- Return a stable identifier and deliver later instructions to that same task agent with its context.
- Run agents concurrently while a user question remains open.
  - Let the orchestrator handle results and land independent tasks during the wait.

If a required interface is absent or explicitly lacks these capabilities, stop preflight.
Name the missing capability and required setup.
Do not create branches or worktrees, substitute sequential execution, or install an extension without the user's authorization.

If an exposed capability is untested, use the waiting fixture.
Record only observed failures through [Platform limits](#platform-limits).

### Claude Code

- Use the available Claude Code agent interface, reading its schema before dispatch.
  - If it exposes `Agent`, set `model` when supported.
  - Set effort only if the interface accepts it.
  - Otherwise, record the inherited effort.
- Start the subagents of all ready tasks in one message so they run at once.
- Send `gaps`, `answer`, and `end` through the exposed continuation interface to the original agent identifier.
  - If this is `SendMessage` and it is deferred, load its schema through `ToolSearch` when available.
  - Confirm that the interface retains context after the agent returns a reply.
- If the interface offers `isolation`, leave it unset because `git worktree add` creates the task worktree.

### Codex

- Start one subagent per task with the Codex session's subagent tools.
  - Send later `gaps`, `answer`, and `end` instructions to the original agent identifier.
  - Resume it if the tool requires resumption.
  - If it loses context after a reply, follow [Platform limits](#platform-limits).
- Set the model and the effort when the tool accepts them.
- Task and verifier agents start no subagents, so the interface needs only one nesting level.
- Check sandbox write rules and required approvals for the worktree root and `.git` in the fixture.

### Pi coding agent

- Pi's built-in tools do not provide subagents.
  - Use an already configured extension or integration only when its documented interface meets the capabilities above.
  - Inspect its tools for dispatch, identifiers, continuation, working directory, and concurrency.
  - Tool names depend on the extension.
- The bundled subagent example launches each child with `--no-session` and exposes no continuation interface for that child.
  - Report its missing continuation capability during preflight.
- Use the integration's persistent agent or session identifier as `agent_id`.
  - A tool that launches a new child for every call does not provide continuation.
- Select model and thinking settings only when the integration supports them.
  - Otherwise, record inherited values.
- Ask questions through visible conversation text unless an extension's question tool lets scheduling continue.

Pi skill loading and invocation are documented in [Skills](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md).
The bundled example is documented in [Subagent Example](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/subagent).

### Invocation examples

Use the current host's command after loading or installing the skill there:

| Host | Request |
| --- | --- |
| Claude Code | `/task-executor:orchestrate with concurrency limit 1` |
| Codex | `$task-executor:orchestrate with concurrency limit 1` |
| Pi coding agent | `/skill:orchestrate with concurrency limit 1` |

On pi, load the skills with `pi --skill <repository>/plugins/task-executor/skills`.
Configure the agent integration through its documented setup.
Loading the skills does not supply subagent tools.

For evals, invoke the named skill through the current host and preserve the scenario arguments.
