# Test quality

Every test names the break it catches and observes real behavior through a seam.

## Name the break

Before the test body, name the production change that would make the test fail.
Confirm that change is a bug rather than a decision.
A test that only an intentional decision can fail fires on redesign and sleeps through bugs.
Test the behavior that depends on a constant, message wording, or private structure instead.
A test that can fail only through a crash names no break.

Derive every expected value by hand from a known-good literal, a worked example, or the specification.
An expectation computed by the code under test or its helpers passes regardless of the code.

Test a script, configuration file, or agent document by running it against controlled input and asserting its effects.
Test a constructor, getter, constant, or forwarding call when it validates, normalizes, defaults, derives, enforces, or causes a side effect.
Otherwise assert the first consumer-visible result that depends on it.

## Test at the seam

Drive the code and observe the result through its public interface, with one logical assertion.
Read a stored result back through the interface, such as retrieving a created record, rather than querying storage.
Leave private functions, internal collaborators, and call order untested unless the requirement makes them part of the contract.

Test the contract your code makes at its seam, such as the route it registers or the payload it produces.
Leave framework mechanics to the framework's tests.

Name each test by the behavior and its condition in the project's domain vocabulary.
The test list then reads as a specification.
A test that breaks under a refactor that changes no behavior is coupled to the implementation.
Move it to the seam.

Test setup that outgrows the test signals a design or interface to simplify.
