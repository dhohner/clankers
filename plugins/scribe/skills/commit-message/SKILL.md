---
name: commit-message
description: Write a Conventional Commit message for staged changes without committing.
---

# Write a commit message

## Process

1. Gather evidence using the rules below.
   - Finish when every distinct substantive change in the selected target is accounted for.
2. Write the message using the subject, body, and footer rules.
   - Explain the principal change and any additional changes needed to represent the selected patch.
3. Check and return the message.
   - Finish when the message meets the evidence, coverage, and formatting requirements.
   - Use the output rules for the result or a blocker.

## Evidence

- Target all staged changes unless the user supplies paths.
- Inspect the diffstat with `git diff --cached --stat --` and the patch with `git diff --cached --no-ext-diff --`.
  - Append supplied paths as pathspecs after `--` in both commands.
  - Report an empty target when it has no staged changes.
- Use the full diffstat to locate substantive changes in large patches.
  - Inspect generated or repetitive changes when they affect scope, compatibility, or behavior, including in patches with source changes.
  - Read the full patch when it changes only generated or repetitive files, such as a lockfile bump.
- Consult recent commit messages for style, structure, and scope conventions.
- Read files or notes named by the user for context about the reason for the change.
- Support every message claim with the staged patch.

## Message

### Subject

- Write `type(scope): summary` for the principal change, or `type: summary` when a scope adds nothing.
- Choose `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, or `revert`.
- Derive the scope from the primary component or directory, reusing a fitting recent scope.
- Use an imperative summary without a period.
- Limit the subject to 72 characters and aim for 50.

### Body

- Omit the body when the subject fully describes the change, such as a typo or version bump.
- Open with the old behavior and its limitation when shown, then describe the new behavior.
  - When no old limitation is shown, describe the new behavior.
- Use concrete behavior in the indicative mood and the project's domain language.
- Add reasons, effects, constraints, or guarantees beyond the subject, stating each claim once.
- Group renames, plumbing, comments, and tests with the changes they serve.
  - Describe tests, comments, or docs directly when they are the change.
- Separate the subject, paragraphs, and blocks with blank lines.
- Use bullets for parallel items that read poorly as prose.
- Include a compact plain text example or diagram when it clarifies behavior, flow, or ownership.
  - Place it after the opening paragraph, indented by two spaces.
  - Preserve meaningful literal syntax and line breaks.
  - For protocol or state transition changes, see [message examples](references/examples.md).
- Limit each body line to 72 characters, choosing a smaller example when a literal exceeds the limit.
- Name touched files only when a shallow tree explains ownership.

### Footers

- Add a separate `BREAKING CHANGE:` footer when the patch clearly requires one.

## Output

Print only the finished message in one `text` fenced block for the user to commit.
If the target is empty or evidence is insufficient, print only a note explaining the blocker.
