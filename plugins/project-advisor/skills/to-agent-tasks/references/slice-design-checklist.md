# Agent task slice checklist

Use this before proposing or writing tasks.

A strong task:

- produces a user-visible or system-verifiable outcome;
- can be implemented and validated in one focused coding-agent run;
- includes the smallest end-to-end change that makes the outcome real;
- has acceptance criteria that can be checked against the running system, tests, or repository artifacts; and
- depends only on tasks whose completed behavior it genuinely needs.

Avoid tasks that only prepare a database, API, UI, migration, component, refactor, or test suite. Fold such work into the outcome it enables unless the separation is a real prerequisite.

Split a task only when it has independently releasable behavior, materially different risk or validation, or an unavoidable sequencing boundary. Combine related requirements when their behavior is best delivered and demonstrated together.

Use a blocked task only when no safe repository-grounded implementation can start without a human decision, external access, design artifact, or prerequisite delivery. Put the exact blocker in the task; do not manufacture a task merely to ask a question.
