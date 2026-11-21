---
name: commit-message
description: Writes a Conventional Commit message for staged changes without committing. Use when the user asks for a commit message or wants staged changes described.
---

# Write a commit message

Write a message the user can paste into the `git commit` editor and read correctly in `git log`.
Print the message and leave committing to the user.

## Gather evidence

- Target all staged changes, or only the paths the user names.
- Run `git diff --cached --stat -- <paths>` and `git diff --cached --no-ext-diff -- <paths>`, omitting `<paths>` when none are named.
- If the target has no staged changes, report that and stop.
- In a large patch, use the diffstat to find the substantive changes.
  - Read generated or repetitive files when they affect scope, compatibility, or behavior.
  - Read the full patch when it contains only generated or repetitive files, such as a lockfile bump.
- Run `git log -n 10 --format=%B` to match the project's types, scopes, and body style.
- Read files or notes the user names for the reason behind the change.
- Account for every distinct substantive change, and support every claim with the staged patch.

## Subject

- Write `type(scope): summary`, or `type: summary` when no scope fits.
- Choose `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, or `revert`.
- Take the scope from the primary component or directory, reusing a recent scope that fits.
- Write the summary in the imperative mood without a trailing period.
- Keep the subject within 72 characters, aiming for 50.

## Body

Omit the body when the subject says everything, such as for a typo fix or a version bump.
Otherwise write for a maintainer who reads `git log` later and needs to know why the code changed.

- Open with the old behavior and its limitation when the patch shows them, then describe the new behavior.
- Add reasons, effects, constraints, or guarantees the subject leaves out, stating each once.
- Group renames, plumbing, comments, and tests with the change they serve, and describe them directly only when they are the change.
- Use the project's domain terms and describe behavior in the present tense.
- Use bullets for parallel items that read poorly as prose.
- Add a compact example or diagram after the opening paragraph when it shows behavior, flow, or ownership more clearly than prose.
  - For protocol or state transition changes, see [message examples](references/examples.md).
- Name touched files only in a shallow tree that explains ownership.

### Voice

Describe the code, and state each change directly.
Remove these patterns:

- Openers about the message itself, such as "This commit" or "This change".
- "Not X but Y" contrasts, unless a reader would actually believe X.
- A closing line that restates the subject or says why the change matters without a new fact.
- Inflated words such as "robust", "seamless", "comprehensive", "enhance", "leverage", and "crucial".
- Claims about speed, safety, or intent that the patch does not show.

## Footers

- Add a `BREAKING CHANGE: <what breaks and how to migrate>` footer when the patch breaks a public API, configuration, stored data, or command behavior.
- Put footers in the last paragraph, one per line.
- Add no `Signed-off-by`, `Co-authored-by`, or other attribution trailers.

## Plain text format

Git and vim show the message as raw text, and `git commit` deletes lines that start with `#` when the message comes from the editor.

- Put the subject on line 1, leave line 2 blank, and start the body on line 3.
- Separate paragraphs, lists, and literal blocks with one blank line.
- Hard-wrap prose at 72 columns, filling each line instead of starting each sentence on a new line.
- Start bullets with `- `, and indent a bullet's wrapped lines by two spaces.
- Indent examples, diagrams, and commands by two spaces and keep their line breaks, using a smaller example when a line would exceed 72 columns.
- Use ASCII only: `->` for arrows, `|` and `+--` for diagram lines, straight quotes, and commas or hyphens instead of em or en dashes.
- Use backticks for identifiers and paths, and no other Markdown: no fences, headings, bold, tables, or `[text](url)` links.
- Reword any line that would start with `#`, such as an issue reference.
- Use spaces instead of tabs, and leave no trailing whitespace.

A body with prose and wrapped bullets looks like this:

```text
fix(sync): retry uploads after a dropped connection

A dropped connection failed the whole sync, and the user had to start
again from the first file. Uploads now resume from the last
acknowledged chunk:

- Each chunk records its offset in `sync-state.json` after the server
  acknowledges it.
- A retry reads the offset and skips acknowledged chunks.

Tests cover a connection dropped mid-chunk and between chunks.
```

## Check

Run this check with the finished message between the heredoc markers:

```sh
LC_ALL=C awk '
  NR == 2 && length { print "2: leave the line after the subject blank" }
  length > 72 { print NR ": longer than 72 columns" }
  /^#/ { print NR ": git strips lines starting with #" }
  /[^ -~]/ { print NR ": tab or non-ASCII character" }
  / $/ { print NR ": trailing whitespace" }
' <<'COMMIT_MSG'
<message>
COMMIT_MSG
```

Fix every reported line and rerun until the check prints nothing.
A URL on its own line may exceed 72 columns.
Then reread the message against the evidence, coverage, and voice rules.

## Output

Print only the finished message in one `text` fenced block.
If the target is empty or the evidence is insufficient, print only a short note naming the blocker.
