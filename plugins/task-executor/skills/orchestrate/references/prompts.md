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
Instruction: end
```

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

### Claude Code

- Start a subagent with the `Agent` tool and set its `model` parameter to the selected model.
  - The tool has no effort parameter, so the used effort is the parent's.
- Start the subagents of all ready tasks in one message so they run at once.
- Send `gaps` and `end` instructions to the task's subagent with `SendMessage`.
  - `SendMessage` can be a deferred tool, so load its schema with `ToolSearch` and `select:SendMessage` first.
- Leave the `isolation` parameter unset, because the task worktree comes from `git worktree add`.

### Codex

- Start one subagent per task with the Codex session's subagent tools.
  - Send later instructions to that running subagent.
- Set the model and the effort when the tool accepts them.
- Codex subagents default to one nesting level, which matches the rule that no subagent starts a subagent.
- The sandbox write rules for the worktree root and for `.git` decide whether approvals appear.
  - The manual check on Codex confirms them.
