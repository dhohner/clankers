# Anti-slop provenance

Source: https://github.com/dmmulroy/anti-slop
Revision: `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`

The upstream install script copied `skills/install-anti-slop/assets/anti-slop/` into this directory.
These assets match the production files under `src/` at the recorded revision.
The upstream MIT license is included in `LICENSE`.
The nested ESLint Stylistic license and provenance remain in `vendor/eslint-stylistic/`.

## Local configuration

`../anti-slop.json` enables every generic rule and `oxc/no-accumulating-spread`.
`plugins/insomniac/.oxlintrc.json` extends the shared rules and registers this directory's `index.ts`.
Its `lint` and `lint:fix` commands use that configuration.
The `.oxlintrc.anti-slop.json` configurations in `plugins/output-styles/` and `plugins/security-guard/` extend their existing lint configurations and the shared rules, and register this directory's `index.ts`.
Their `lint:anti-slop` commands select those configurations.
The root `pnpm lint:anti-slop` command checks plugins still being migrated, continuing after a plugin reports violations.
CI uses `pnpm lint:ts`, which runs each plugin's ordinary `lint` command.
`insomniac` requires anti-slop in CI through its default configuration.
After another plugin's violations are fixed, merge its anti-slop configuration into `.oxlintrc.json` to require these rules in CI.
The vendored files are outside those plugins' lint and format scopes.
Effect rules are included but disabled because these plugins do not declare Effect as a dependency.

`@oxlint/plugins` is installed at the workspace root so imports from this shared directory resolve.
It and each plugin's Oxlint dependency are pinned to `1.86.0` and should be upgraded together.
A local `package.json` declares this directory as an ES module to avoid Node's module detection warning.
The copied rule source has no local changes.

Run `node tools/oxlint/verify-anti-slop.mjs` to verify each plugin's lint commands.
It checks valid input and existing lint violations.
It verifies that ordinary lint rejects anti-slop violations in `insomniac` and accepts them in plugins still being migrated.
