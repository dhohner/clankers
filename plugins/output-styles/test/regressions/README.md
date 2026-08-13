# Regression tests

Each file here locks down one fixed defect.

- Use the file name pattern `<short-slug>.test.ts`.
  The name carries no issue number, because the GitHub repository `dhohner/clankers` has issues disabled.
- Start each file with a comment that states the defect the test locks down.
- Import the shared fixtures from `../support/extension-harness.js`, and declare any `vi.mock` block in the file itself.
- Put a test here only when it proves the absence of one specific defect.
  A test that states normal behavior belongs in the concern file that `../README.md` names.
