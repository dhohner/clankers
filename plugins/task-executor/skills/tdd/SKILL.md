---
name: tdd
description: >-
  Implement a change through red-green-refactor with tests that prove they catch the break.
  Use when asked to work test-first or to add tests to existing code.
---

# Implement through TDD

Write each test before the production code it proves.
Watch it fail for the expected reason, then write the smallest code that passes.
A test that never failed proves nothing about the code.

Read [test quality](references/test-quality.md) before the first test.
Read [mocking](references/mocking.md) when a test needs a dependency replaced.
Read [mutation check](references/mutation-check.md) before reporting the change complete.

Work through every check, fix, and validation run without pausing for review before the change is complete.

## Plan the checks

Split the change into single-behavior checks, each at a seam.
A seam is the public interface that exposes the behavior.
Take the seam from the requirement or the module's existing interface.
Otherwise choose the narrowest interface a caller already uses, and record the choice.

Give each behavior a success check and one check per boundary and failure path.
Cover untested pre-existing behavior the change touches, and prove each such check red by disabling the behavior once.
When no runnable harness or deterministic outcome exists, record the reason and the manual verification that replaces it.

Write and pass one check before writing the next.
Revise the remaining checks with what each cycle teaches.

Planning is complete when every check has a seam and an automated or manual mark.

## Red

Write one test for the next check, run it, and read the failure.
When only a planned symbol is absent, add the smallest declaration that lets the test run, and rerun.
Fix a missing dependency or a failure in discovery, syntax, fixtures, or unrelated imports before counting red.
A test that passes at once checks existing behavior, so sharpen it or move on.

Red is complete when the test fails on its own assertion for the absent behavior.

## Green

Write the smallest production change that passes the test.
Add no option, branch, or abstraction the test does not require.
Change the test only when its expectation contradicts the requirement.

Green is complete when the new test and the affected suite pass with clean output.

## Refactor

Remove duplication, sharpen names, and extract helpers that name a domain concept.
Keep behavior and test expectations unchanged.
Return to Red for the next check while the suite stays green.

## Complete

Run the mutation check and the change's validation commands.
Report each check with its red and green evidence.
Label validation as new-behavior coverage, regression coverage, or manual verification.

The change is complete when:

- Every automated check has observed red and green evidence.
- Every manual check has a recorded reason and result.
- Every mutation names a failing test.
- Every validation command passes.

Discard production code written ahead of its test, and restart that check from Red.
