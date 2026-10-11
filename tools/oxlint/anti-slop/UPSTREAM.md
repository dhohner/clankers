# Anti-slop provenance

Source: https://github.com/dmmulroy/anti-slop
Revision: `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`

The upstream install script copied `skills/install-anti-slop/assets/anti-slop/` into this directory.
These assets match the production files under `src/` at the recorded revision.
The upstream MIT license is included in `LICENSE`.
The nested ESLint Stylistic license and provenance remain in `vendor/eslint-stylistic/`.

## Local configuration

`../anti-slop.json` enables every generic rule and `oxc/no-accumulating-spread`.
The `.oxlintrc.json` configurations in `plugins/insomniac/` and `plugins/output-styles/` extend the shared rules and register this directory's `index.ts`.
Their `lint` and `lint:fix` commands use those configurations.
The `plugins/security-guard/.oxlintrc.anti-slop.json` configuration extends its existing lint configuration and the shared rules, and registers this directory's `index.ts`.
Its `lint:anti-slop` command selects that configuration.
The root `pnpm lint:anti-slop` command checks plugins still being migrated, continuing after a plugin reports violations.
CI uses `pnpm lint:ts`, which runs each plugin's ordinary `lint` command.
`insomniac` and `output-styles` require anti-slop in CI through their default configurations.
After another plugin's violations are fixed, merge its anti-slop configuration into `.oxlintrc.json` to require these rules in CI.
The vendored files are outside those plugins' lint and format scopes.
Effect rules are included but disabled because these plugins do not declare Effect as a dependency.

`@oxlint/plugins` is installed at the workspace root so imports from this shared directory resolve.
It and each plugin's Oxlint dependency are pinned to `1.86.0` and should be upgraded together.
A local `package.json` declares this directory as an ES module to avoid Node's module detection warning.
The copied rule source has no local changes.

Run `node tools/oxlint/verify-anti-slop.mjs` to verify each plugin's lint commands.
It checks valid input and existing lint violations.
It verifies that ordinary lint rejects anti-slop violations in `insomniac` and `output-styles` and accepts them in `security-guard`, which is still being migrated.
