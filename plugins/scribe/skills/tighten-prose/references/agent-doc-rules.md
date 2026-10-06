# Agent document rules

## Scope and judgment

Retain guidance that changes agent decisions or supplies non-obvious context.
Distinguish wording edits from changes to triggers, requirements, permissions, or completion boundaries.

- Apply only authorized behavioral changes; report other proposals separately.
- Match specificity to risk: flexible outcomes for open-ended work, exact steps for fragile operations.
- Preserve invariants, requirements, exceptions, dependencies, and authorization boundaries even when their wording is lengthy.
- Keep optional recommendations distinct from requirements.

## Context pointers

A context pointer names out-of-context material and states which branches load it.
A branch is a distinct case that follows a different path through the material.

- Front-load each branch's trigger; the pointer's wording controls whether the agent loads its target.
- Keep one precise trigger per branch, collapsing synonyms that cover the same requests.
- Remove identity already stated in the surrounding document.
- Sharpen weak pointers before inlining required material they fail to expose.
- For model-invoked skills, keep descriptions short, in third person, and specific about capability and activation branches.
- For user-invoked skills, use a one-line human-facing summary without trigger lists.
- Preserve intended coverage when tightening triggers; narrowing coverage is a behavioral change.
  - Migration example: "Creates and validates Postgres migrations when adding, changing, or reviewing a migration's rollout."

## Skill discovery and resources

- Link every reference directly from `SKILL.md` with its loading condition.
- Keep reference links one level deep: `SKILL.md` to reference; reference files must not link to other references.
- Flatten deeper chains into `SKILL.md` pointers, preserving content and workflow requirements.
- Keep simple skills self-contained; add routing only for distinct branches.
- Give references longer than 100 lines a short contents list.
- Use consistent terms, descriptive filenames, and forward-slash paths.
- Preserve supported frontmatter and invocation policy.
- Treat platform limits as ceilings, not length targets.
- Distinguish scripts to execute from code to read, and retain dependency requirements and useful error handling.
- Use fully qualified MCP tool names in the target platform's syntax.
- Prefer a useful default with a justified exception over a menu of equivalent approaches.

## Hierarchy

- Put the outcome and essential constraints first; follow with ordered actions when sequence matters.
- Keep shared purpose and material needed by every branch inline; disclose substantial branch-specific reference behind pointers.
- Co-locate each concept's definition, rules, and caveats.
- Split sprawling references by branch or sequence only when the cut improves navigation or execution.

## Completion criteria

- Define observable completion for the task; add intermediate checks where failures would matter.
- Sharpen vague bounds using existing context; flag missing decisions instead of inventing requirements.
- Preserve required implementation, inspection, repair, and verification before completion.
- Preserve demand, such as "every modified model accounted for," in steps and reference rules.
- Recommend removing first-pass review stops only when the intended workflow should continue beyond them.
- Bound retries and external mutations by the authorized scope and concrete stopping conditions.

## Repository instructions and model guidance

- Recommend routing repository docs by relevance while preserving explicit reading requirements.
  - Example: "Use architecture.md for service boundaries, database.md for schema changes, and deployment.md when preparing a deployment."
- Recommend affected checks and repair loops proportional to the change.
- State established local permissions precisely, preserving separate production approval requirements.
  - Example: "Local tests use disposable fixtures without production access; run them, repair change-related failures, and rerun affected tests."
- For GPT-6 Astra targets, favor clear outcomes and completion boundaries over elaborate recipes or repeated encouragement to verify work.
- Review inherited approval rules for unintended stopping points while preserving required approvals.
- Consider every intended model; guidance useful to Sol or Luna may still be needed in a shared skill.
- Avoid universal claims about model behavior and calendar-based switches that become stale.

## Evaluation and iteration

For skill authoring or substantial behavioral revisions, use these evaluation rules.

- Identify demonstrated failures and define representative evaluations before adding extensive instructions.
- Use at least three scenarios covering intended activation, task outcomes, and relevant boundaries.
- Compare behavior with and without the skill, and test with intended models when available.
- Check reference navigation, missed constraints, unnecessary loading, and completion through real usage.
- Refine the smallest instruction that addresses an observed failure.
- Report performed checks, unrun evaluations, and unavailable models separately.
- Do not claim cross-model validation from a structural check.

## Leading words

- Replace a repeated phrase with one compact pretrained word, then reuse that word.
- State the positive target behavior, and reserve prohibitions for hard guardrails paired with that target.

## Pruning

- Keep each meaning in one authoritative place, and remove duplicates.
- Remove redundant environment facts when lookup preserves needed guidance; retain exact commands, unwritten conventions, rationale, and hidden gotchas.
- Remove generic explanations, obsolete scaffolding, and model defaults that carry no explicit requirement or model-specific need.
- Remove lines unrelated to the document's task.
