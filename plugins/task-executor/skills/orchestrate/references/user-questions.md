# User questions and platform limits

## User questions

Post the question in the parent conversation while independent task agents keep working.
Keep handling their results, starting ready tasks, and landing commits before the user answers.
Use a platform question tool only if scheduling can continue during the wait.

Send a plain chat question as a visible text block before continuing scheduler tool calls.
Continue the parent turn after asking while independent work is ready to start or land.
Name the task file to route later replies to its `agent_id`.

Ask in arrival order, using task prefix order for simultaneous stops.
Persist every waiting task even if another question is already open.
Label each question with its task file and affected item.

When several tasks wait, ask the user to name the task in each answer.
Route each answer by task identity.

## Platform limits

Assess context retention and scheduling during questions from observed fixture results on each platform.
Keep the original agent open with its context for later instructions, including while its task waits.

If context resumption fails, record the observed error or context loss in `run.json` under `platform_limits`.
Tell the user.
Keep the task `waiting` and its file `pending` for a rerun in a new worktree.

Resume only the original agent during a continuation.

If orchestration suspends until a user reply, record the scheduling limit and its evidence in `platform_limits`.
Tell the user.
Independent commits during a wait remain unverified or failed on that platform until a mechanism passes the fixture.
