// Defect: the kept-list warning shared the once-per-session report key of a skipped style file, so
// a directory that stayed unlistable reported once and every later /output-style invocation kept
// the frozen list in silence. The user could not tell a working plugin from a stuck one.
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { STYLES_DIR_NAME } from "../../src/pi/registration.js";
import { agentDir, styleFile, writeStyle } from "../support/extension-harness.js";

import { failingFileSystem, harnessWithFileSystem, type ListFailures } from "../support/filesystem.js";

const listFailures: ListFailures = {};

const createHarness = harnessWithFileSystem(failingFileSystem(listFailures));

afterEach(() => {
  listFailures.path = undefined;
});

it("reports the kept style list on the second and the third invocation as well", async () => {
  const userStyles = join(agentDir, STYLES_DIR_NAME);
  await writeStyle(userStyles, "terse.md", styleFile("One-line answers.", "Answer in one line."));
  const harness = createHarness();
  await harness.start();

  listFailures.path = userStyles;

  for (let invocation = 0; invocation < 3; invocation += 1) {
    harness.answerSelect(undefined);
    await harness.runCommand("");
  }

  expect(harness.notifications).toEqual(
    Array.from({ length: 3 }, () => ({
      message: `Output styles keep the previous list: ${userStyles} (cannot list directory: EACCES: permission denied)`,
      level: "warning",
    })),
  );
});
