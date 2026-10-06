# Bundled gmsg message rules

These rules and examples come from Scribe's `commit-message` skill, which local `scripts/gmsg.sh` invokes.
Fallback requires neither Scribe nor Pi.

## Contents

- [Evidence](#evidence)
- [Message](#message)
- [Output](#output)
- [Good message examples](#good-message-examples)
- [Bad example](#bad-example)

## Evidence

Gather evidence in the commit worktree.

- Use the task outcome as context.
  - Support every message claim with the staged patch.
- Target all staged changes unless the user supplies paths.
- Inspect the diffstat and patch:

  ```sh
  git diff --cached --stat --
  git diff --cached --no-ext-diff --
  ```

  - Append supplied paths as pathspecs after `--` in both commands.
  - Report an empty target when it has no staged changes.
- Locate every substantive change in large patches with the full diffstat.
  - Inspect generated or repetitive changes affecting scope, compatibility, or behavior, including alongside source changes.
  - Read the full patch when all changes are generated or repetitive, such as a lockfile bump.
- Consult recent commit messages for style, structure, and scope conventions.
- Read user-named files or notes for the change's reason.

Evidence is complete when it accounts for every substantive change and supports every planned claim.

## Message

### Subject

- Describe the principal change with `type(scope): summary`, or `type: summary` when a scope adds nothing.
- Choose `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, or `revert`.
- Derive the scope from the primary component or directory.
  - Reuse a fitting recent scope.
- Use an imperative summary without a period.
- Limit the subject to 72 characters and aim for 50.

### Body

- Omit the body when the subject fully describes the change, such as a typo or version bump.
- Open with the old behavior and its shown limitation.
  - Then describe the new behavior.
  - When no old limitation is shown, describe the new behavior.
- Describe concrete behavior in the indicative mood using the project's domain language.
- Add reasons, effects, constraints, or guarantees beyond the subject.
  - State each claim once.
- Group renames, plumbing, comments, and tests with the changes they serve.
  - Describe tests, comments, or docs directly when they are the change.
- Separate the subject, paragraphs, and blocks with blank lines.
- Use bullets for parallel items that read poorly as prose.
- Include a compact plain text example or diagram to clarify behavior, flow, or ownership.
  - Place it after the opening paragraph, indented by two spaces.
  - Preserve meaningful literal syntax and line breaks.
  - Use the examples below for protocol or state transition changes.
- Limit each body line to 72 characters.
  - Choose a smaller example when a literal exceeds the limit.
- Name touched files only when a shallow tree explains ownership.

### Footers

- Add a separate `BREAKING CHANGE:` footer when the patch clearly requires one.

## Output

Print the finished message alone in one `text` fenced block.
If the target is empty or evidence is insufficient, print only a note explaining the blocker.

Pass only the finished message inside the fence to Git.
Keep presentation fences and blocker notes outside the commit message.
Resolve insufficient evidence before selecting a message.

## Good message examples

### Delegated protocol

The patch gives `implement` a delegated prompt and message protocol.
The message shows the contract's prompt fields and exchanges.

```text
feat(implement): add delegated mode for orchestrators

Implement handles a task directly and asks the user for missing input.
A delegated prompt supplies the task and working directory instead:

  Mode: delegated
  Task file: <path>
  Working directory: <path>

  orchestrator -> implement: prompt
  implement -> orchestrator: stop | implemented
  orchestrator -> implement: gaps | answer | end
  implement -> orchestrator: implemented | stop | ended

In delegated mode, implement leaves the task file unchanged and
returns control without asking the user or making a commit.
```

### Retry state transition

The patch stops automatic retries when a delivery reaches its attempt limit.
The message shows the changed transitions and terminal state.

```text
fix(delivery): stop retrying after the attempt limit

Failed deliveries stayed eligible for retry after the attempt limit.
The final failed attempt now marks the delivery as exhausted:

  pending -> sending -> delivered
                 |
                 +----> pending    below the attempt limit
                 +----> exhausted  at the attempt limit

Exhausted deliveries are no longer selected for automatic retry.
```

## Bad example

This body fails to describe the delegated protocol:

```text
Replace the prompt and add message handlers.

- Update implement and its tests for better orchestration.
```

The body narrates the diff, omits the contract, and claims an unsupported improvement.
Describe the concrete behavior and its supported reason.
Group tests with the change they serve.
