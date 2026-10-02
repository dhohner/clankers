# Interview connection and submission checks

Use the prepared scratch directory and live session with six questions in `ROUND-01`.
Keep the round files and original session available after submission.

## Server stop and restart

1. Action: stop the server process named by `pid` in `$S/session/interview/state.json` with `kill`.
   Expected: the lamp and the tab title show `Server not available`, and the draft stays on the page.
2. Action: run the same `interview ask` for `$S/round-01.yaml` again in the background.
   Expected: the server restarts on the same port, and the tab reconnects without a reload.
   The status returns to `Round open`, and the draft stays.

## Page connection

1. Action: keep the tab open for 20 seconds while the ask waits.
   Expected: the ask process still runs and has printed no `browser_disconnected` payload.

## Submit

1. Action: mock `**/api/answers` with status 400 and a fault body, then press `Submit round`.
   Expected: the page shows the fault text, the draft stays, and the status stays `Round open`.
   Remove the mock afterwards.
2. Action: route `**/api/answers` to fetch the server answer, wait 2 seconds, then fulfill the request with that answer.
   This delay lets the page read the answered round before its submit answer.
   Press `Submit round` with all six answers, wait 3 seconds, and remove the route.
   Expected: the ask prints an `answered` payload with six answers, and the local storage entry for `ROUND-01` is gone.
   The lamp and the tab title show `Agent works`, and the page shows no fault and no `Server not available`.

## Competing tabs

Run each step in a new session, such as `$S/session-tabs/` with `$S/round-02.yaml`, and end that session afterwards.
Each `playwright-cli` command waits for the page's open requests, so run each step in one `playwright-cli run-code` call.
Delay a request in a route handler with the page's `setTimeout`, and remove the routes with `unrouteAll({ behavior: 'ignoreErrors' })` before a reload.

1. Action: in tab A, answer the round and write a comment.
   Delay `**/api/answers` by 1 second and `**/api/page` by 3 seconds.
   Tab A then gets its submit answer before its next state read.
   Press `Submit round` in tab A.
   While tab A waits, open the page link in tab B, answer the round, and press `Submit round`.
   Wait 5 seconds, then reload tab A.
   Expected: tab B's submit succeeds and tab A's gets 409.
   Before reloading, tab A's page message shows `The server rejected the submit.` and the 409 text after its state read.
   The page throws no error.
   Before and after the reload, the local storage entry holds tab A's choices and comment.
2. Action: repeat step 1 with `**/api/answers` waiting 3 seconds and no wait on `**/api/page`.
   Tab A then reads the answered round before its submit answer.
   Expected: the same results as step 1.
3. Action: after step 1, start `interview ask` for `$S/round-03.yaml` in the same session without a reload.
   Expected: tab A shows `ROUND-03` with no rejection message, and the `ROUND-02` draft stays in local storage.
