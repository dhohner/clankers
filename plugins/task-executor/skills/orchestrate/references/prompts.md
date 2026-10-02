# Agent prompts and instructions

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

Use the canonical `implement` verifier prompt loaded by the orchestrator.
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
