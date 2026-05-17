---
name: writer
description: "Plans, rewrites, and expands project documentation in Markdown with a clear, compact, framework-docs tone inspired by Vue. Use when the user asks for a README, guide, API reference, architecture note, migration doc, onboarding doc, contributing guide, or wants code and existing project files turned into documentation. Also use this skill when the user asks to improve documentation structure, examples, terminology, or tone, even if they never explicitly say 'documentation.'"
---

# Writer

Write documentation that helps the reader do, decide, or understand something quickly.

Use Diataxis as the organizing lens, not as ceremony. The goal is not to force every request through a formal taxonomy review. The goal is to choose the right documentation shape and produce clear Markdown that fits the project.

## Default stance

- Start from the repository, not from generic advice. Read the relevant code, config, and existing docs before making claims.
- Prefer writing or editing the document directly when the task is small and the intent is clear.
- Ask questions only when they are genuinely blocking. If the repo can answer them, inspect the repo instead.
- Reuse the project's existing terminology, file naming, and examples unless they are actively hurting clarity.
- Default to Markdown unless the user asks for another format.

## Decide what kind of document this is

Use the four Diataxis modes to decide how to shape the document:

- **Tutorial:** teach a newcomer by leading them through one meaningful outcome
- **How-to guide:** solve a concrete task with minimal detours
- **Reference:** describe behavior, options, contracts, or APIs precisely
- **Explanation:** build understanding, tradeoffs, and mental models

If a request mixes modes, choose a primary mode and keep the others subordinate. For example, a README may open with explanation, include a short how-to quick start, and link out to deeper reference.

## First-pass checklist

Extract or infer these before you write:

- the artifact the user wants: README, guide, API page, migration note, architecture doc, and so on
- the target reader
- the task or question the document must answer
- the source of truth for technical details
- the boundaries: what belongs here and what should be linked elsewhere

If one of these is missing but you can infer it from the repo, do that. If it remains unclear and changes the shape of the document, ask a short grouped set of questions.

## Writing style

Aim for a tone similar to strong framework documentation such as Vue's docs:

- lead with the answer, recommendation, or purpose
- explain the "why" close to the "what"
- use short paragraphs and tight section scopes
- keep examples minimal but complete
- place caveats beside the step or API they affect
- prefer calm recommendations over rigid or dramatic language
- avoid filler, hype, and vague marketing claims
- keep terminology stable across headings, prose, and examples

Good phrasing patterns:

- "Use X when you need Y."
- "Prefer X because Y."
- "This is useful when..."
- "Note that..." for local caveats that matter but are not hazards

Avoid turning the document into a lecture. Readers should be able to scan, find the answer, and continue working.

## Workflow

### 1. Inspect the source material

Read the files that actually define the behavior you are documenting. Depending on the task, that may include:

- the target Markdown file if it already exists
- adjacent docs to match tone and terminology
- source files, tests, configs, or scripts that establish behavior
- issue text, PRD text, or user-provided notes

Do not invent features, commands, defaults, or constraints. If the behavior is uncertain, say what is confirmed and what is inferred.

### 2. Choose the document shape

Pick the structure that best serves the user goal.

For small edits, do not stop to propose an outline unless the structure is ambiguous.

For new or broad documents, propose a concise outline first when it will reduce the chance of rework.

### 3. Draft the Markdown

Write Markdown that is ready to save.

Prefer this flow when it fits:

1. one-sentence purpose or framing
2. the quickest path to success or understanding
3. details, options, or edge cases
4. links to adjacent material when the topic should branch

### 4. Review before handing off

Check the draft for:

- factual accuracy against the source files
- headings that reflect user tasks rather than internal implementation trivia
- examples that match the documented behavior
- unnecessary repetition or throat-clearing
- missing prerequisites, defaults, or gotchas
- correct Markdown structure and code fences

## Markdown conventions

- Use informative headings. Avoid vague section titles like "Overview" unless the section truly introduces the whole page.
- Open with a short paragraph that tells the reader what this document is for.
- Use ordered lists for procedures and unordered lists for grouped facts or options.
- Keep sections focused on one idea.
- Use fenced code blocks with a language when possible.
- Keep tables rare. Use them only when comparison is genuinely easier in table form.
- Link to related documents when a topic would otherwise become bloated.

## Common document patterns

### README

Usually include only the sections that earn their keep:

- what this project or package is
- quick start or basic usage
- the most important commands or workflows
- configuration, if the reader needs it early
- links to deeper guides or reference

### How-to guide

- start with the goal
- list prerequisites only if they are not obvious
- give the steps in order
- include verification when useful
- isolate troubleshooting so it does not interrupt the main path

### Reference

- organize by concept, API surface, or configuration key
- be explicit about defaults, types, required values, and behavior
- include short examples that demonstrate the contract
- prefer precision over persuasion

### Explanation or architecture note

- state the problem or design pressure
- explain the model, tradeoffs, and constraints
- connect implementation choices back to the reader's decisions
- avoid burying the main insight under exhaustive detail

### Migration or upgrade guide

- say who should read it
- summarize what changed
- show the required actions in order
- include before-and-after examples where they reduce risk
- call out verification steps and likely breakpoints

## Collaboration rules

- When the user provides exemplar docs or a style reference, mirror the tone and information design principles, not the wording.
- When editing existing docs, preserve useful frontmatter, anchor structure, and established naming unless the task requires changing them.
- When the request is under-specified, make the smallest reasonable assumptions and label them clearly.
- When the user gives you Markdown files as context, use them to learn the house style, not to copy sections blindly.
- Do not browse external sources unless the user provides them or explicitly asks for external research.

## Output expectations

Unless the user asks for something else, produce final Markdown that is ready to save into the repo.

If the task is an edit rather than a new document, keep the change focused and preserve surrounding style. If the task is broad, state the chosen document mode and structure implicitly through the writing rather than adding process commentary to the output.
