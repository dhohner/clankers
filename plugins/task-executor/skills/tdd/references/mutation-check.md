# Mutation check

Before reporting the change complete, name the test that fails for each realistic mutation of the production code:

- a wrong constant or argument
- a wrong branch handler
- a missing state change or side effect
- an empty or default return
- missing validation for zero, empty, nil, unauthorized, or malformed input

When no test is obviously affected, apply the mutation, run the suite, and revert it.
A mutation no test catches marks the behavior as unprotected or the test as tautological.
Add or sharpen the test.
