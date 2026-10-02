# Interview conversation and draft checks

Run this list with `playwright-cli` against a live interview session.
Each item names the action and the expected result.
The unit tests cover the server routes and the static page rules, and this list covers the page in a browser.

Keep the scratch directory and session available for subsequent browser checks.

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
   Earlier replies sit in a collapsed `Previous answers` section below the current question.
   Expanding it shows each reply with an `Edit reply` button.
   Advancing or editing collapses the section, and the final review opens it automatically.
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
   Expected: the reloaded page keeps confirmed replies collapsed, resumes at the first unconfirmed question, and restores choices, texts, notes and the round comment.
   Reloading a completed draft opens the replies for review.
2. Action: list the local storage entries.
   Expected: one entry whose key holds the session directory and `ROUND-01`.
