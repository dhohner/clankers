import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import outputStyles from "../../index.ts";
import { SETTINGS_FILE_NAME, readPersistedStyleName } from "../../src/storage/settings.ts";
import { parseStyleFile } from "../../src/styles/style-file.ts";
import { agentDir, CHAINED_PROMPT, createHarness, styleStatus } from "../support/extension-harness.ts";

describe("host bootstrap", () => {
  it("resolves bundled assets and the host agent directory through the default export", async () => {
    vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
    const harness = createHarness({ flag: "unslop", install: outputStyles });
    await harness.start();
    const file = new URL("../../styles/unslop.md", import.meta.url);
    const parsed = parseStyleFile(file.pathname, await readFile(file, "utf8"), "bundled");

    expect(parsed.ok).toBe(true);

    if (!parsed.ok) throw new Error(parsed.reason);

    expect(harness.notifications).toEqual([]);
    expect(harness.status()).toBe(styleStatus("unslop"));
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\n${parsed.style.instructions}`);
    await harness.runCommand("default");
    expect(await readPersistedStyleName(join(agentDir, SETTINGS_FILE_NAME))).toEqual({
      status: "selected",
      value: "default",
    });
  });
});
