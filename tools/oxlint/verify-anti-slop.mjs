import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), "clankers-anti-slop-"));
const cases = [
  {
    name: "valid",
    source: "export function present(value: string): boolean {\n  return Boolean(value);\n}\n",
    lint: [],
    "lint:anti-slop": [],
  },
  {
    name: "anti-slop-violation",
    source: "export function present(value: unknown): boolean {\n  return Boolean(value);\n}\n",
    lint: [],
    "lint:anti-slop": ["anti-slop(no-unknown-parameters)"],
  },
  {
    name: "existing-rule-violation",
    source: "const unused = 1;\n",
    lint: ["eslint(no-unused-vars)"],
    "lint:anti-slop": ["eslint(no-unused-vars)"],
  },
];

try {
  for (const plugin of ["insomniac", "output-styles", "security-guard"]) {
    const cwd = join(root, "plugins", plugin);
    const commands = plugin === "insomniac" ? ["lint"] : ["lint", "lint:anti-slop"];

    for (const testCase of cases) {
      const fixture = join(temporary, `${testCase.name}.ts`);
      writeFileSync(fixture, testCase.source);

      for (const command of commands) {
        const codes =
          plugin === "insomniac" && command === "lint"
            ? testCase["lint:anti-slop"]
            : testCase[command];
        const label = `${plugin} ${command} ${testCase.name}`;
        const result = spawnSync(
          "pnpm",
          ["--silent", "run", command, "--format", "json", fixture],
          {
            cwd,
            encoding: "utf8",
          },
        );

        assert.ifError(result.error);
        assert.equal(
          result.status,
          codes.length === 0 ? 0 : 1,
          `${label}: ${result.stderr}\n${result.stdout}`,
        );
        const report = JSON.parse(result.stdout);
        assert.equal(report.number_of_files, 1, `${label}: fixture must be linted`);
        assert.deepEqual(
          report.diagnostics.map((diagnostic) => diagnostic.code),
          codes,
          label,
        );
      }
    }

    console.log(`${plugin}: lint commands enforce their configured rules`);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
