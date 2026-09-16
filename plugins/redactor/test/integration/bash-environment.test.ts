import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBashHost } from "../support/bash-host.ts";

const SELECTED = "REDACTOR_TEST_SELECTED_6f2a";
const OTHER = "REDACTOR_TEST_OTHER_6f2a";
const SELECTED_VALUE = "sk-live-ENVIRONMENT-0123456789";
const OTHER_VALUE = "unrelated-value-6f2a";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function hostWithSelection(extraSelections: Array<{ name: string; label: string }> = []) {
  const previous = { selected: process.env[SELECTED], other: process.env[OTHER] };
  process.env[SELECTED] = SELECTED_VALUE;
  process.env[OTHER] = OTHER_VALUE;
  cleanups.push(() => {
    restore(SELECTED, previous.selected);
    restore(OTHER, previous.other);
  });
  const h = await createBashHost();
  cleanups.push(h.cleanup);
  const path = join(h.agentDirectory, "redactor", "credentials.json");
  await mkdir(join(path, ".."), { recursive: true });
  const selections = [{ name: SELECTED, label: "Selected" }, ...extraSelections];
  await writeFile(path, JSON.stringify({ version: 1, selections }));
  await h.startSession();
  return h;
}

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("ordinary bash environment (TEST-06, partial)", () => {
  it("removes selected variables from a real child process and keeps unrelated variables", async () => {
    const h = await hostWithSelection();

    const run = await h.runBash(`printf '%s|%s|%s' "\${${SELECTED}:-absent}" "\${${OTHER}:-absent}" "$PI_SESSION_ID"`);

    expect(run.error).toBeUndefined();
    expect(run.text).toBe(`absent|${OTHER_VALUE}|redactor-bash-host`);
    expect(h.extensionErrors).toEqual([]);
  });

  it("removes a selected PI session variable that the host adds after copying the environment", async () => {
    const h = await hostWithSelection([{ name: "PI_SESSION_ID", label: "Session" }]);

    const run = await h.runBash(`printf '%s|%s' "\${PI_SESSION_ID:-absent}" "\${${OTHER}:-absent}"`);

    expect(run.error).toBeUndefined();
    expect(run.text).toBe(`absent|${OTHER_VALUE}`);
  });

  it("keeps the parent process environment unchanged", async () => {
    const h = await hostWithSelection();

    await h.runBash(`printf '%s' "\${${SELECTED}:-absent}"`);

    expect(process.env[SELECTED]).toBe(SELECTED_VALUE);
    expect(process.env[OTHER]).toBe(OTHER_VALUE);
  });

  it("still redacts the selected value when a command prints it from another source", async () => {
    const h = await hostWithSelection();
    await writeFile(join(h.workingDirectory, "leak.txt"), SELECTED_VALUE);

    const run = await h.runBash("cat leak.txt");

    expect(run.text).toMatch(/^\[redacted:cred-[0-9a-f]{10}\]$/);
    expect(run.text).not.toContain(SELECTED_VALUE);
  });
});
