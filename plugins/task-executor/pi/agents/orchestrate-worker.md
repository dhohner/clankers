---
name: orchestrate-worker
aliases: orchestrate-fixture-worker
description: Implements assigned orchestrate tasks with the installed implement and tdd skills
tools: read, bash, edit, write
systemPromptMode: append
inheritProjectContext: true
inheritSkills: false
defaultContext: fresh
skills: implement, tdd
---

Follow the assigned `orchestrate` task protocol.
Load the selected `implement` and `tdd` skills from their catalog entrypoints.
Do not spawn subagents.
Reply only in the delegated mode message format, using `stop`, `implemented`, or `ended`.
Return decision stops as a final `stop` message so the parent can schedule independent work.
The parent must launch this profile with `options.intercomBridge: { mode: "off" }`.
The parent must confirm that setting through launch preflight.
Include the unresolved decision in the final `stop` message and finish the run.
The parent owns task state, run files, verification dispatch, commits, and integration.
