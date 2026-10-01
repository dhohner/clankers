# Verify waiting tasks

This fixture uses a temporary repository with no remote.
Agents use the current host's local credentials.
The fixture commands create local commits only in the temporary repository.

Run the scenarios on the host being checked, using its configured agent interface.

## Choose the host

Follow [Platform mechanisms](prompts.md#platform-mechanisms) and confirm the required capabilities before starting the fixture run.
After preparing the repository below, launch the selected host there:

| Host | Launch | Skill request |
| --- | --- | --- |
| Claude Code | `claude --plugin-dir <repository>/plugins/task-executor` | `/task-executor:orchestrate with concurrency limit 1` |
| Codex | `codex`, with this plugin installed through the local marketplace | `$task-executor:orchestrate with concurrency limit 1` |
| Pi coding agent | `pi --skill <repository>/plugins/task-executor/skills`, with an integration providing persistent task agents | `/skill:orchestrate with concurrency limit 1` |

For pi, configure the integration through its documented setup.
The skill flag only loads instructions.

With pi's built-in tools alone or bundled subagent example alone, verify that preflight reports the missing agent capability.
Verify that it creates no run folder, branch, or worktree.

Use a fresh fixture for each host to isolate task states and commits.
Evals 1 through 9 require an agent interface that passes the capability check.
Eval 10 checks rejection when required capabilities are absent.

## End while independent work lands

Use this scenario for `TEST-05`.
Resolve `<repository>` to this plugin repository's absolute path.
Prepare the fixture outside it:

```sh
workspace=$(mktemp -d)
sh <repository>/plugins/task-executor/skills/orchestrate/evals/inputs/setup-orchestrate-eval.sh "$workspace" stop
cd "$workspace/repo"
git rev-parse HEAD
git remote -v
```

Save the initial `HEAD` and confirm there is no remote.
Launch the selected host and use its skill request from [Choose the host](#choose-the-host).

- Task 01 needs a public URL separator decision.
- Task 02 is independent.
- Task 03 depends on both.

Withhold the decision until task 02 lands.
From another terminal in the fixture, inspect:

```sh
find action-items/agent-tasks/runs -name run.json
python3 -m json.tool <run.json path>
git log --oneline <integration branch>
git worktree list
```

- Check that the question names task 01, its affected item, options, consequences, and recommendation.
- Check that task 01 is `waiting` with its question and original `agent_id`.
- Check that task 02 commits before any answer, despite concurrency 1.
- Check that task 03 has no agent or worktree.

Then answer:

```text
End task 01.
```

Check that `Instruction: end` reaches the original agent and it returns `ended` without further edits.
Read `run.json`, the three task files, and the integration log.

- Check that task 01 is `ended` with `state: pending` and no commit.
- Check that the summary names task 01's retained worktree and branch.
- Check that task 02 is `done` with exactly one integration commit.
- Check that task 03 remains `pending` and `not_started`.
- Check that the start branch still points at the saved `HEAD`.

## Rerun and continue

Use this scenario for `TEST-06`.
Run `orchestrate` again in the same fixture.
Check that it skips task 02 and continues the earlier integration branch.
Check that it starts task 01 in a new worktree.
Answer its separator question:

```text
Continue task 01 with hyphen as the public URL separator.
```

- Check the transcript confirms `Instruction: answer` reaches this run's original task 01 agent with its context.
- Check that task 01 completes verification and lands one commit.
- Check that task 03 then starts and lands one commit.
- Check that the integration branch has three task commits total.
- Check that all three task files have `state: done`.
- Check that the start branch ref remains at the saved `HEAD`.

## Other boundaries

- In a fresh stop fixture, answer continue during the first run after task 02 lands.
  - Verify the same agent resumes and both remaining tasks commit after coverage.
- In another fresh fixture, terminate the session while task 01 waits.
  - Verify its recorded status is `waiting`, its question is retained, and its task file is `pending`.
  - Rerun and verify a new task worktree is used and `done` tasks are skipped.
- Exercise evals 8 and 9 at the verifier result seam.
  - Use their controlled final gap report and pass limit 1.
  - Treat the report as test input and preserve the canonical verifier prompt.
  - Verify explicit acceptance records gaps as accepted before committing.
  - Verify continuation starts a new verification round with the full limit.
  - Check that another final gap prompts another question.
  - Check that ending leaves no task commit.
- When two tasks wait, verify question ordering and routing from their original agent identifiers.
  - Check that an ambiguous answer causes clarification without a state transition.

## Host results

Repeat `TEST-05` and `TEST-06` for each host being validated, using its invocation from [Choose the host](#choose-the-host).
For Codex, run in the user's session with the local marketplace configured.
For pi, name the configured agent integration in the verification report.

Observe whether later instructions reach the same agent with context.
Observe whether independent commits land before the answer.
If either fails, preserve the tool error or scheduling evidence in `run.json` under `platform_limits`.

Report the limit following [Platform limits](prompts.md#platform-limits).
Do not record an unexecuted scenario as a platform failure or a passing result.
