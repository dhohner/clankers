# Mocking

Mock only a dependency at a system boundary that is slow, external, or nondeterministic.
Typical boundaries are external services, clocks, and randomness.
Treat a database or the filesystem as a boundary only when no real test instance is available.
Your own modules and internal collaborators are never boundaries.

Pass boundary dependencies in as parameters or constructor arguments, so a test can supply a mock without patching.
Give each external operation its own named function, so each mock returns one shape without conditional logic.

Before mocking a dependency, list its side effects.
Keep the side effects the test depends on real, and mock the level below them.
Give a mock the complete real structure, including fields the test does not read.

When arguments, call counts, or order are part of the contract, assert them with one fixture per branch.
Assert on the real component's behavior.
An assertion on the mock itself passes whenever the mock is present, so remove the mock or the assertion.

Keep test-only cleanup and helpers in test utilities rather than on production classes.
When mock setup outgrows the test logic, switch to an integration test with real components.
