# Interview lifecycle and policy checks

Use the original `$S/session/`, where `ROUND-01` has been submitted.
Keep `$S/round-02.yaml` and `$S/round-03.yaml` available for the next rounds.

## New round and history

1. Action: start `interview ask` for `$S/round-02.yaml` in the background without a reload.
   Expected: the tab shows `ROUND-02` with the status `Round open`.
2. Action: look below the round.
   Expected: `Earlier rounds` lists `ROUND-01` collapsed.
   Expanding it shows each answer as text without form controls.

## Round submitted

1. Action: stop the waiting ask for `ROUND-02` with `kill`, then answer and submit `ROUND-02` on the page.
   Expected: the lamp and the tab title show `Round submitted`.
2. Action: use `kill` to stop the server process named by `pid` in `$S/session/interview/state.json`.
   Then run `interview open $S/session`.
   Expected: the server restarts on the same port, and the tab reconnects without a reload.
   The lamp and tab title show `Round submitted`.
3. Action: run the same ask for `$S/round-02.yaml` again.
   Expected: it prints the stored answers at once, and the lamp and the tab title show `Agent works` without a reload.

## Page files and policy

1. Action: run `curl -s -D - -o /dev/null` on the page link without the fragment while a server runs, and read the `Content-Security-Policy` header.
   The server answers only `GET` and `POST`, so `curl -I` does not show the header.
   Expected: it holds `connect-src 'self'` and no `unsafe-inline`, no `http:` and no `https:` source.
2. Action: list the console messages.
   Expected: no policy violation and no failed request other than the ones this list caused.
3. Action: evaluate the page body's computed `font-family`.
   Check requests for `/assets/shared/base.css`, `/assets/interview/styles.css`, and `/assets/interview/tokens.css`.
   Check requests for `/assets/shared/tokens.css`, `/assets/shared/typography.css`, and `/assets/fonts/manrope.woff2`.
   Expected: the body uses `Manrope`, and the styles and font load with status 200.
4. Action: run the static page tests and generate a review bundle in a scratch directory.
   Expected: interview assets live in `bundle/assets/interview/`, and generated review bundles contain shared and review assets without interview files.

## Session end

1. Action: start `interview ask` for `$S/round-03.yaml` and wait for `Round open`.
   Then run `interview end $S/session`.
   Expected: the lamp and the tab title show `Session ended`, and the form controls are disabled.
