# Agent document rules

## Context pointers

A context pointer names out-of-context material and states which branches load it.
A branch is a distinct case that follows a different path through the material.

- Front-load the trigger because a context pointer's wording controls whether the agent loads its target.
- Give each branch one trigger, and remove synonyms for the same branch.
- Remove identity already stated in the surrounding document.

## Hierarchy

- Put the agent's ordered actions first.
- Keep material needed by every branch inline.
- Disclose branch-specific material behind a context pointer.
- Co-locate each concept's definition, rules, and caveats.

## Completion criteria

- End each step with a checkable completion criterion, and sharpen vague bounds instead of deleting them.
- Preserve demand, such as "every modified model accounted for," because it controls the agent's thoroughness.

## Leading words

- Replace a repeated phrase with one compact pretrained word, then reuse that word.
- State the positive target behavior, and reserve prohibitions for hard guardrails paired with that target.

## Pruning

- Keep each meaning in one authoritative place, and remove duplicates.
- Remove cheap environment lookups, such as `package.json` scripts or `--help` output, and keep unwritten conventions, rationale, and hidden gotchas.
- Remove sentences that repeat the model's defaults.
- Remove lines unrelated to the document's task.
