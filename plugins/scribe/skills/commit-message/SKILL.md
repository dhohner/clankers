---
name: commit-message
description: Write a Conventional Commit message for staged changes without committing them.
disable-model-invocation: true
---

# Write a commit message

## Process

1. Resolve the target.
   - Without path arguments, target every staged change.
   - With path arguments, append them as pathspecs after `--` in each `git diff` command below.
   - Stop and report if the target has no staged changes.
2. Collect the inputs.

   ```sh
   git log --format='- %s' -n 10
   git diff --cached --stat --find-renames --find-copies -- <pathspecs>
   git diff --cached --no-ext-diff --find-renames --find-copies --diff-algorithm=histogram -- <pathspecs> <noise excludes>
   ```

   - Replace `<noise excludes>` with pathspecs for lockfiles, minified files, and source maps, such as `':(top,exclude,glob)**/package-lock.json'`.
     - Keep these files in the diffstat so the change's scope remains visible.
   - Read the full patch when it only changes excluded files, such as a plain lockfile bump.
   - For a large patch, judge scope from the diffstat and read the hunks that carry behavior.
3. Read files or notes named by the user, such as handoffs and task descriptions, as background.
   - Use the background to understand why the change exists.
   - Include only claims supported by the staged patch.
4. Analyze the patch without printing the analysis.
   - Describe each distinct change as a concrete behavior, rule, data flow, or interface.
   - Avoid goal labels such as "improve X".
   - Fold renames, plumbing, comments, and test updates into the change they serve.
   - Select the change with the largest effect as the main change.
   - For each change, record every reason the patch shows.
     - Check limitations in removed code and removed workarounds or TODOs.
     - Check new test names, error messages, comments, and dependencies between changes.
5. Write the message according to "Message rules".
6. Check every line against these limits.
   - Limit the subject to 72 characters and aim for 50.
   - Limit each body line to 72 characters.
   - Limit the body to six lines of text.
7. Print the message in a `text` fenced block and leave the commit to the user.
   - Print nothing else unless analysis is blocked.
   - If blocked, add only a note about the blocker.

## Message rules

### Subject

- Use `type(scope): summary` for the main change, or `type: summary` when no scope adds value.
- Use one of `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, or `revert`.
- Derive the scope from the primary component or directory, and reuse a scope from the recent subjects when one fits.
- Use the imperative mood with no trailing period.
- Make "If applied, this commit will <summary>" read as a sentence.

### Body

- Separate the body from the subject with a blank line.
- Write short paragraphs separated by blank lines.
- Explain the reason and leave implementation to the code.
  - State the old behavior and its limitation in the first sentence.
  - State the new behavior in the second sentence.
  - Add a third sentence only when the subject omits a side effect.
- Describe the old and new behavior in the indicative mood.
  - Rewrite "Replace X with Y" as what X did wrong and what Y does now.
- Include only claims supported by the patch, and state each claim once.
- Remove evaluative or general clauses, such as "which made X harder" or "more precisely".
- If the patch shows no reason, describe the behavior change and stop.
- Give each secondary change one sentence in a second paragraph.
  - Skip a secondary change when its description needs only one line.
- Mention tests, comments, or docs only when they are the change.
- Use bullets only for parallel items that read poorly as prose.
- Omit the body only when the subject says everything, such as for a typo, version bump, or dependency update.

### Content

- Omit touched files and do not restate the subject in the body.
- Do not label changes as main or secondary or discuss the message itself.
- Use recent subjects only for style, and derive content from the staged patch.
- Add only trailers required by the patch.
- Add a separate `BREAKING CHANGE:` footer only when the patch clearly requires one.

## Example

A patch simplifies a stream class's exception handling and removes helpers that became unreachable.

Good message:

```text
refactor(serialize): simplify stream exception handling

exceptmask always included failbit and setstate was only ever called
with failbit, so the stream state machinery amounted to raising an
exception immediately. Throwing directly drops the flags and the dead
paths that served them.

good() can no longer be false after an error and reduces to !eof();
fail(), clear(n) and exceptions() have no callers left and are gone.
```

This body narrates the diff and puts one change in a bullet:

```text
Remove state and exceptmask from the stream implementations and
replace setstate with direct throws.

- Replace good() with !eof() and delete fail(), clear(n) and
  exceptions()
```
