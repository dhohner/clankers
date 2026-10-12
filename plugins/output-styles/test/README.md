# Test layout

Tests follow the source structure, with each test file covering one concern.

## Where a test belongs

### Pi adapters

`pi/` covers the bootstrap, registration, dialogs, and footer formatting in `src/pi/`.
Extension behavior uses the fake Pi surface in `support/extension-harness.ts`.

| File | Concern |
| --- | --- |
| `pi/extension.test.ts` | Default bootstrap, bundled asset paths, and host agent directory. |
| `pi/style-application.test.ts` | Flag registration and prompt application. |
| `pi/style-switching.test.ts` | Commands, selector, completions, cycle shortcut, and footer entry. |
| `pi/style-rescan.test.ts` | Rescans initiated by command invocations. |
| `pi/active-style-rescan.test.ts` | Active selection refresh and fallback. |
| `pi/style-persistence.test.ts` | Registration using real settings files. |
| `pi/persistence-failures.test.ts` | Registration with controlled persistence failures and pending writes. |
| `pi/create-flow.test.ts` | Dialogs, validation, and creation through `/output-style new`. |
| `pi/headless-modes.test.ts` | Print and remote modes without a user interface. |
| `pi/status.test.ts` | Footer formatting. |

### Styles

`styles/` tests `src/styles/` without Pi registration.
Parser tests belong in `frontmatter.test.ts` and `style-file.test.ts`.
Discovery tests belong in `discovery.test.ts` and control concurrent reads with promises.
Prompt application and serialization belong in `prompt.test.ts` and `create-style.test.ts`.
`bundled-styles.test.ts` checks the shipped `styles/` assets and their README table.
`example-style.test.ts` checks `examples/terse.md`.

### Session logic

`session/` tests `src/session/` without Pi or filesystem effects.
`startup-selection.test.ts` covers startup precedence and unknown names.
`style-session.test.ts` covers catalogue adoption, active selection, fallback, diagnostic deduplication, selector snapshots, and scan ordering.

### Storage

`storage/` tests `src/storage/`.
`settings.test.ts` uses real temporary files and locks to check persistence, permissions, replacement, and concurrent writes.
`filesystem.test.ts` checks filesystem error decoding.
`json.test.ts` checks JSON object parsing.

### Package and dependencies

`integration/pi-loader.test.ts` checks loading and registration through the real Pi loader, then bundled style selection and prompt application through Pi's session and turn dispatch.
It uses temporary project and agent directories, disables model discovery over the network, and emits events through `ExtensionRunner` without making a model request.
`integration/package-layout.test.ts` checks exports and package contents declared by the manifests.
`integration/dependency-boundaries.test.ts` checks the separation of Pi runtime imports and adapters from the other modules.

### Shared code

`errors.test.ts` covers `src/errors.ts`.
`support/matchers.test.ts` and `support/offline-guard.test.ts` cover their corresponding helpers.

### Regression tests

A test that prevents a specific fixed defect from recurring belongs in `regressions/`.
Use the file name pattern `<short-slug>.test.ts`, and start the file with a comment that states the defect.
Omit issue numbers from the name because the GitHub repository `dhohner/clankers` has issues disabled.
Put a test there only when it proves the absence of one specific defect.
A test that states normal behavior belongs in the concern file above, even when a defect prompted it.

## Rules for shared code

- Shared fixtures belong in `support/`.
  Reuse the harness factory, temporary directory variables, style helpers, and cleanup hooks from `support/extension-harness.ts`.
- Inject filesystem failures through `support/filesystem.ts`.
  Each test file owns its failure records and clears them in its own `afterEach`.
- Use `support/persistence.ts` for controlled persistence failures and delayed writes.
  Its memory implementation preserves write ordering for each path.
  Real settings tests remain responsible for filesystem locking and replacement.
- Use `support/deferred.ts` to control asynchronous completion without elapsed time delays.
- The Vitest configuration shuffles file and test order.
  Tests must not depend on state created by another file or test.
- `expect.requireAssertions` is active, so every test must assert.
