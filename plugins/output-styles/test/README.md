# Test layout

Each test file covers one concern.
A reader who looks for a behavior opens one file, and an author who writes a test has one correct place to put it.

## Where a test belongs

Ask which concern the test proves, then use the table.

### Extension behavior through the harness

These files drive the registered extension through the fake Pi surface in `support/extension-harness.ts`.

| File                          | Concern                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `style-application.test.ts`   | The flag registration, and the style the extension applies to the turn prompt. |
| `style-switching.test.ts`     | The command, the selector, the argument completions, the cycle shortcut, and the footer entry. |
| `style-rescan.test.ts`        | The rescan of the style directories that each command invocation starts.       |
| `active-style-rescan.test.ts` | The re-resolution of the active style after a rescan, and the fallback to `default`. |
| `style-persistence.test.ts`   | The read and the write of the settings file, and the startup style it selects. |
| `create-flow.test.ts`         | The dialogs, the validation, and the file write of `/output-style new`.        |
| `headless-modes.test.ts`      | The print mode and the remote mode, which have no user interface.              |

### Single module behavior

These files call one module of `lib/` directly.
A test belongs here when it needs no extension harness.

| File                    | Module under test                                             |
| ----------------------- | ------------------------------------------------------------- |
| `frontmatter.test.ts`   | `lib/frontmatter.ts`                                          |
| `style-file.test.ts`    | `lib/style-file.ts`                                           |
| `discovery.test.ts`     | `lib/discovery.ts`                                            |
| `prompt.test.ts`        | `lib/prompt.ts`                                               |
| `settings.test.ts`      | `lib/settings.ts`                                             |
| `status.test.ts`        | `lib/status.ts`                                               |
| `create-style.test.ts`  | `lib/create-style.ts`                                         |
| `support/matchers.test.ts` | The shared matcher in `support/matchers.ts`                |

### Package and asset checks

| File                     | Concern                                                             |
| ------------------------ | -------------------------------------------------------------------- |
| `bundled-styles.test.ts` | The style files this package ships in `styles/`.                     |
| `example-style.test.ts`  | The style file in `examples/`.                                       |
| `loader.test.ts`         | The extension entry point that Pi loads.                             |
| `prompt-parity.test.ts`  | The agreement of the replace-mode prompt with Pi's own prompt builder. |

### A regression test

A test that locks down a fixed defect belongs in `regressions/`.
Use the file name pattern `<short-slug>.test.ts`, and start the file with a comment that states the defect.
The name carries no issue number, because the GitHub repository `dhohner/clankers` has issues disabled.
Put a test there only when it proves the absence of one specific defect.
A test that states normal behavior belongs in the concern file above, even when a defect prompted it.

## Rules for shared code

- A fixture that more than one file needs belongs in `support/`.
  No test file re-implements a fixture that `support/extension-harness.ts` already offers.
  That module owns the harness factory, the temporary directory variables `root`, `bundledDir`, `agentDir`, and `cwd`, the helpers `writeStyle`, `styleFile`, `promptOptions`, and `styleStatus`, and the `beforeEach` and `afterEach` hooks that rebuild and remove the temporary root.
- A `vi.mock` block belongs in the test file that needs it.
  Vitest hoists `vi.mock` and `vi.hoisted` per test file, so a shared module cannot register a module mock for another file.
  A file that injects a filesystem failure therefore declares its own mock block, and clears the failure record in its own `afterEach`.
- The vitest configuration shuffles both the file order and the test order.
  A test must therefore not depend on state that another test or another file created.
  The shared hooks give every test a fresh temporary root, which keeps that property.
- `expect.requireAssertions` is active, so every test must assert.
