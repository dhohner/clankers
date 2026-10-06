---
name: tighten-prose
description: Tighten AI-generated prose and agent instructions without changing meaning.
disable-model-invocation: true
---

## Process

1. Resolve the target:
   - With no arguments, target prose added or changed in `git diff --cached`.
   - With path arguments, target all prose in those files or directories.
   - With a commit range such as `main..HEAD`, target prose changed by those commits.
2. Inventory every target file and prose passage.
3. Read each target file in full, including surrounding conditions and cross-references.
4. Apply every rule under "Prose rules" to every target passage.
   - For skills, agent documents, or task prompts, apply the relevant [agent document rules](references/agent-doc-rules.md).
5. Tighten every target passage.
   - Prose includes Markdown, source comments, and doc comments.
   - Preserve the required form of code, configuration, commands, paths, identifiers, URLs, and quotations.
6. Compare every rewrite with its original.
   - For meaning-preserving edits, retain every instruction, condition, exception, quantity, claim, and reader behavior.
   - Keep longer wording when shortening changes meaning.
   - Apply only authorized behavioral changes; report other proposals separately.
7. Preserve the index boundaries.
   - Re-stage only rewritten prose that was staged before editing.
   - Preserve every unrelated staged and unstaged change.
8. Report each file's added and removed lines, wording kept to preserve meaning, and proposed behavioral changes.

## Prose rules

Write concise, result-first technical prose.

### Substance

- Make every sentence a fact, instruction, exact quantity, or supported judgment.
- Name the actor and action.
- State relevant limits, such as "fast but hard to debug" instead of "fast."
- Attribute claims to named sources, and remove claims credited only to "experts" or "research."
- Order points by importance, include only task-specific content, and stop when complete.

### Language

- Use plain words, such as "use" instead of "utilize" and "help" instead of "facilitate."
- Use concrete nouns and strong verbs instead of vague metaphors such as "landscape" or "north star."
- Prefer "is" and "has" to phrases such as "serves as" and "boasts."
- Remove filler, weak qualifiers, needless adverbs, generic praise, generic transitions, and unsupported importance claims.
- State points directly without "not just X, but Y" contrasts or false ranges.
- Use one precise term for each concept.
- Give each sentence one idea, and split sentences that require rereading.

### Tone

- Write instructions in the imperative mood.
- Use simple present for facts and behavior, and simple past only for completed events.
- Limit instructions to 20 words and descriptions to 25 words.
- Include articles, and break clusters of more than three nouns.
- Place each warning before its protected step, and use imperative language.

### Formatting

- Replace em dashes, en dashes, and parenthetical asides with hyphens, commas, or separate sentences.
- Put each complete Markdown sentence on its own source line.
- Reserve colons for lists and examples, and use straight quotation marks.
- Use unnumbered, sentence-case headings.
- Put paths, identifiers, and technical literals in inline code, and put commands and code excerpts in fenced blocks.
- Bold at most two terms per section.
- Write one sentence per bullet, and put extra sentences in one-level sub-bullets.

### Structure

- Limit each paragraph to one topic and three sentences.
- Use bullets for parallel facts, steps, or options, and use tables for comparisons across shared attributes.
- Make each point scannable through headings and opening words.
