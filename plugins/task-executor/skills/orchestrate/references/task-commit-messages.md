# Task commit messages

Use this procedure to select messages for task commits, amendments, and resolved conflict candidates.
Select a new message for each resolved candidate.

## Invoke gmsg

1. Stage task changes, excluding task-directory paths and generated artifacts.
   - Set a 120-second deadline with the host's process timeout or a bounded subprocess.
2. Attempt `gmsg` without arguments in the task worktree through the available shell.
   - Use an exposed zsh alias or function.
   - Treat failed lookup in a non-interactive shell as a missing command.
   - Use fallback when unavailable.
   - Continue without installing `gmsg` or requiring Pi during preflight.
   - At the deadline, terminate the invocation and its children, then wait for all to stop.
   - Treat a yielded running process as incomplete.
3. Capture stdout, stderr, and the exit code separately.
   - Keep stderr outside the message.

Invocation completes after exit or failed lookup, with stdout, stderr, and the exit code captured.

## Select the message

Select stdout verbatim when `gmsg` exits 0 and stdout contains a non-whitespace character.
Preserve complete stdout without additions or rewrites.

If `gmsg` is missing, fails, times out, or returns empty or whitespace-only stdout, discard its output.
Write from the staged diff and task outcome.
Apply the bundled evidence, subject, body, footer, output rules, and examples.

### Empty conflict candidates

For an eligible empty conflict candidate, attempt `gmsg` in the resolution worktree.
If fallback is needed, use the original task commit's diff and recorded resolution outcome as evidence.
Describe that outcome without claiming a new candidate diff, and commit with `--allow-empty`.
Ordinary tasks with an empty index exit with `no_changes` before message selection.

### Selection gate

Keep the selected message the user's own, without an agent name, AI attribution, or co-author trailer.
If successful `gmsg` output violates this gate, stop before committing.
Preserve the output and report the violation.
Selection completes when the message passes the attribution gate and, for fallback, evidence covers every substantive change.

## Record and commit

Set this task's `commit_message_source` in `run.json` to `gmsg` or `bundled_rules` before committing.
Update it for every new message selection, including amendments and conflict resolution.
Retain the source after landing or commit failure.

Pass message text as data through a message file or stdin.
Never interpolate it into shell code.

```sh
git commit -F <message file>
git commit -F -
```

For verbatim messages, add `--cleanup=verbatim` to preserve the supplied text.
Check bundled message formatting before committing.
Apply formatting amendments only to bundled messages.
Recording and committing complete after source persistence and commit success or handling under the existing failure rule.
