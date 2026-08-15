// Defect: the kept-list warning shared the once-per-session report key of a skipped style file, so
// a directory that stayed unlistable reported once and every later /output-style invocation kept
// the frozen list in silence. The user could not tell a working plugin from a stuck one.
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { STYLES_DIR_NAME } from "../../lib/extension.js";
import { agentDir, createHarness, styleFile, writeStyle } from "../support/extension-harness.js";

// File modes do not deny listing reliably on every OS or for a privileged user, so the listing
// failure is injected instead of provoked through the filesystem.
const listFailures = vi.hoisted(() => ({ path: undefined as string | undefined }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readdir: (path: Parameters<typeof actual.readdir>[0], ...rest: unknown[]) =>
      String(path) === listFailures.path
        ? Promise.reject(Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" }))
        : (actual.readdir as (...args: unknown[]) => unknown)(path, ...rest),
  };
});

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
