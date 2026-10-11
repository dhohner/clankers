# Anti-slop provenance

Source: https://github.com/dmmulroy/anti-slop
Revision: `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`

The upstream install script copied `skills/install-anti-slop/assets/anti-slop/` into this directory.
These assets match the production files under `src/` at the recorded revision.
The upstream MIT license is included in `LICENSE`.
The nested ESLint Stylistic license and provenance remain in `vendor/eslint-stylistic/`.

## Local configuration

`../anti-slop.json` enables every generic rule and `oxc/no-accumulating-spread`.
The `.oxlintrc.json` configurations in `plugins/insomniac/`, `plugins/output-styles/`, and `plugins/security-guard/` extend the shared rules and register this directory's `index.ts`.
Their `lint` and `lint:fix` commands use those configurations.
CI requires these rules through `pnpm lint:ts`, which runs each plugin's `lint` command.
The vendored files are outside those plugins' lint and format scopes.
Effect rules are included but disabled because these plugins do not declare Effect as a dependency.

`@oxlint/plugins` is installed at the workspace root so imports from this shared directory resolve.
It and each plugin's Oxlint dependency are pinned to `1.86.0` and should be upgraded together.
A local `package.json` declares this directory as an ES module to avoid Node's module detection warning.
The copied rule source has no local changes.

Run `node tools/oxlint/verify-anti-slop.mjs` to verify each plugin's lint commands.
It checks that `lint` and `lint:fix` accept valid input and reject both anti-slop violations and existing lint violations in every plugin.
