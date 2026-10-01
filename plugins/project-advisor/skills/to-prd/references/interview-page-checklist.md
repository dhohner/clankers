# Interview page check list

Run this list with `playwright-cli` against a live interview session.
Each item names the action and the expected result.
The unit tests cover the server routes and the static page rules, and this list covers the page in a browser.

## Setup

Run every command from the skill directory `plugins/project-advisor/skills/to-prd/`.
Use a scratch directory outside `action-items/`, such as `$TMPDIR/interview-check/`.

1. Create `$S/session/` and set `TO_PRD_INTERVIEW_BROWSER_LOG=$S/browser.log`, so the CLI writes the page link to that file and opens no browser.
2. Write `$S/round-01.yaml` with six questions in this order:
   - `NODE-01`, single select, with the question text `Is <b>markup</b> shown as text?` and two options, one recommended.
   - `NODE-02`, multi select, with three options, two recommended.
   - `NODE-03`, `NODE-04`, `NODE-05` and `NODE-06`, single select, with two options each, one recommended.
3. Write `$S/round-02.yaml` and `$S/round-03.yaml` with one single-select question each.
4. Start `python3 -m scripts interview ask $S/session $S/round-01.yaml` in the background, with stdout in `$S/ask-01.out`.
5. Run `playwright-cli open "<link from browser.log>"`.

## Automated conversation coverage

Run `node tests/interview_conversation.browser.mjs` from the skill directory with an installed `playwright` package.
Set `TO_PRD_PLAYWRIGHT_MODULE` to the package path if it is installed elsewhere.
Set `TO_PRD_CHROMIUM_EXECUTABLE` to a compatible Chromium executable if needed.
The test starts a local interview in a temporary directory, checks drafts and submission against the server, and closes the session afterwards.
It prints the directory containing screenshots for inspection.

## Conversation

1. Action: take a snapshot of the page.
   Expected: only the active question shows its options with their descriptions, a `Recommended` mark on each recommended option, `Write my own answer`, `Decide later`, and `Out of scope`.
   Choosing `Write my own answer` reveals the written reply field.
   `Next question` records the answer in the transcript and opens the next unanswered question.
   When no unanswered questions remain, `Review answers` records the answer and opens the review.
   Earlier replies have an `Edit reply` button.
2. Action: read the first question text.
   Expected: the text shows `<b>markup</b>` with the angle brackets, and the question holds no `b` element.
3. Action: answer `NODE-01`, press `Next question`, and look at `NODE-02`.
   Expected: its options are check boxes, and two of them can be checked at once.
   The single-select questions use radio buttons.
4. Action: advance through the conversation, choosing `Decide later` on `NODE-04` and `Out of scope` on `NODE-05`.
   Expected: each shows a reason field marked `Required`, and the progress line does not count the question until the reason holds text.
5. Action: look at each question and the end of the round.
   Expected: `Add a note` reveals the active question’s optional note field.
   After adding every reply, `Add a round comment` reveals the optional round comment field.
6. Action: count the buttons on the page, then press `Enter` and `Control+Enter` in a note field.
   Expected: `Next question` is shown while more questions remain, `Review answers` is shown for the final answer, and `Submit round` is shown during the review.
   No key press in a note field submits the round or changes a choice.
7. Action: answer five questions, then all six.
   Expected: `Next question` or `Review answers` is disabled until the active answer and any required reason are complete.
   After all six replies have been added, the review shows every reply and an enabled `Submit round` button.
8. Action: list the network requests after the choices.
   Expected: the page sent no request with the draft; it sent only `GET` requests to `/api/presence` and `/api/page`.
   No request holds the token in its path or query, and the page text does not show the token.

## Draft

1. Action: reload the page with a partial draft, such as three answers, a note and a comment.
   Expected: the reloaded page shows confirmed replies in the transcript, resumes at the first unconfirmed question, and restores choices, texts, notes and the round comment.
2. Action: list the local storage entries.
   Expected: one entry whose key holds the session directory and `ROUND-01`.

## Server stop and restart

1. Action: stop the server process named by `pid` in `$S/session/interview/state.json` with `kill`.
   Expected: the lamp and the tab title show `Server not available`, and the draft stays on the page.
2. Action: run the same `interview ask` for `$S/round-01.yaml` again in the background.
   Expected: the server starts on the same port, the tab connects again without a reload, the status returns to `Round open`, and the draft stays.

## Page connection

1. Action: keep the tab open for 20 seconds while the ask waits.
   Expected: the ask process still runs and has printed no `browser_disconnected` payload.

## Submit

1. Action: mock `**/api/answers` with status 400 and a fault body, then press `Submit round`.
   Expected: the page shows the fault text, the draft stays, and the status stays `Round open`.
   Remove the mock afterwards.
2. Action: route `**/api/answers` to fetch the server answer, wait 2 seconds, and then fulfill the request with it, so the page reads the answered round before its submit answer.
   Press `Submit round` with all six answers, wait 3 seconds, and remove the route.
   Expected: the ask prints an `answered` payload with six answers, and the local storage entry for `ROUND-01` is gone.
   The lamp and the tab title show `Agent works`, and the page shows no fault and no `Server not available`.

## Competing tabs

Run each step in a new session, such as `$S/session-tabs/` with `$S/round-02.yaml`, and end that session afterwards.
Each `playwright-cli` command waits for the page's open requests, so run each step in one `playwright-cli run-code` call.
Delay a request in a route handler with the page's `setTimeout`, and remove the routes with `unrouteAll({ behavior: 'ignoreErrors' })` before a reload.

1. Action: in tab A, answer the round and write a comment.
   Route `**/api/answers` to wait 1 second and `**/api/page` to wait 3 seconds before they continue, so tab A gets its submit answer before its next state read.
   Press `Submit round` in tab A, and while tab A waits, open the page link in tab B, answer the round, and press `Submit round`.
   Wait 5 seconds, then reload tab A.
   Expected: tab B's submit succeeds and tab A's gets 409.
   Before the reload, tab A shows `The server rejected the submit.` with the 409 text in the page message after its state read, and the page throws no error.
   Before and after the reload, the local storage entry holds tab A's choices and comment.
2. Action: repeat step 1 with `**/api/answers` waiting 3 seconds and no wait on `**/api/page`, so tab A reads the answered round before its submit answer.
   Expected: the same results as step 1.
3. Action: after step 1, start `interview ask` for `$S/round-03.yaml` in the same session without a reload.
   Expected: tab A shows `ROUND-03` with no rejection message, and the `ROUND-02` draft stays in local storage.

## New round and history

1. Action: start `interview ask` for `$S/round-02.yaml` in the background without a reload.
   Expected: the tab shows `ROUND-02` with the status `Round open`.
2. Action: look below the round.
   Expected: an `Earlier rounds` section lists `ROUND-01` collapsed, and the expanded entry shows each answer as text without form controls.

## Round submitted

1. Action: stop the waiting ask for `ROUND-02` with `kill`, then answer and submit `ROUND-02` on the page.
   Expected: the lamp and the tab title show `Round submitted`.
2. Action: stop the server process named by `pid` in `$S/session/interview/state.json` with `kill`, then run `interview open $S/session`.
   Expected: the server starts on the same port, the tab connects again without a reload, and the lamp and the tab title show `Round submitted`.
3. Action: run the same ask for `$S/round-02.yaml` again.
   Expected: it prints the stored answers at once, and the lamp and the tab title show `Agent works` without a reload.

## Session end

1. Action: start `interview ask` for `$S/round-03.yaml`, wait for `Round open`, then run `interview end $S/session`.
   Expected: the lamp and the tab title show `Session ended`, and the form controls are disabled.

## Page files and policy

1. Action: run `curl -s -D - -o /dev/null` on the page link without the fragment while a server runs, and read the `Content-Security-Policy` header.
   The server answers only `GET` and `POST`, so `curl -I` does not show the header.
   Expected: it holds `connect-src 'self'` and no `unsafe-inline`, no `http:` and no `https:` source.
2. Action: list the console messages.
   Expected: no policy violation and no failed request other than the ones this list caused.
3. Action: evaluate the computed `font-family` of the page body and read the requests for `/assets/shared/base.css`, `/assets/interview/styles.css`, `/assets/interview/tokens.css`, and `/assets/interview/fonts/manrope.ttf`.
   Expected: the body uses `Manrope`, and the styles and font load with status 200.
4. Action: run the static page tests and generate a review bundle in a scratch directory.
   Expected: interview assets live in `bundle/assets/interview/`, and generated review bundles contain shared and review assets without interview files.
