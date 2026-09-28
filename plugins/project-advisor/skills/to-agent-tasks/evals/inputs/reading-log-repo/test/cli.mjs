import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { run } from "../src/cli.mjs";

function capture() {
  let text = "";
  return { write: (chunk) => (text += chunk), get text() { return text; } };
}

test("help prints the usage and exits 0", async () => {
  const stdout = capture();
  assert.equal(await run(["help"], { stdout }), 0);
  assert.match(stdout.text, /^Usage: reading-log/);
});

test("an unknown command prints the usage to stderr and exits 2", async () => {
  const stderr = capture();
  assert.equal(await run(["frobnicate"], { stderr }), 2);
  assert.match(stderr.text, /^unknown command: frobnicate/);
});

test("importing the module without a script argument does not run the CLI", () => {
  const url = new URL("../src/cli.mjs", import.meta.url).href;
  const result = spawnSync(process.execPath, ["-e", `await import(${JSON.stringify(url)})`], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
});
