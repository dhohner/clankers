# Regression tests

Each file tests that one specific fixed defect does not recur.

- Use the file name pattern `<short-slug>.test.ts`.
  Omit issue numbers from the name because the GitHub repository `dhohner/clankers` has issues disabled.
- Start each file with a comment describing the defect the test prevents.
- Import shared fixtures from `../support/extension-harness.js`.
  Inject filesystem failures through `../support/filesystem.js`, and clear failure records in the file's `afterEach`.
- Put a test here only when it proves the absence of one specific defect.
  A test that states normal behavior belongs in the concern file that `../README.md` names.
