// Defect: one catch covered the settings lock, the read, and the JSON parse of the persisted style
// name and returned "no stored selection" for all of them. A settings file held by a concurrent Pi
// settings write therefore looked exactly like a fresh installation: the stored style was dropped in
// silence, the session started with the built-in default, and the footer stayed empty.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import lockfile from "proper-lockfile";
import { expect, it } from "vitest";
import { STYLES_DIR_NAME } from "../../lib/extension.js";
import { OUTPUT_STYLE_KEY, SETTINGS_FILE_NAME } from "../../lib/settings.js";
import { agentDir, createHarness, styleFile, writeStyle } from "../support/extension-harness.js";

it("reports the settings file instead of starting silently as a fresh installation", async () => {
  await writeStyle(join(agentDir, STYLES_DIR_NAME), "terse.md", styleFile("One-line answers.", "Answer in one line."));
  const settingsPath = join(agentDir, SETTINGS_FILE_NAME);
  await mkdir(agentDir, { recursive: true });
  await writeFile(settingsPath, JSON.stringify({ [OUTPUT_STYLE_KEY]: "terse" }), "utf8");

  // A lock held for the whole session start outlasts the retry window, which is what a normal
  // concurrent Pi settings write does not do.
  const release = await lockfile.lock(settingsPath, { realpath: false });
  const harness = createHarness({ trusted: false });
  try {
    await harness.start();
  } finally {
    await release();
  }

  expect(harness.notifications).toHaveLength(1);
  expect(harness.notifications[0]?.level).toBe("warning");
  expect(harness.notifications[0]?.message).toContain(`Output style settings could not be read: ${settingsPath} (`);
  expect(harness.notifications[0]?.message).toContain("The session continues.");
  // The session still starts, with the built-in default style and no footer entry.
  expect(harness.status()).toBeUndefined();
});
