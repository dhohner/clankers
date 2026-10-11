import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STYLES_DIR_NAME } from "../../src/pi/registration.ts";
import { SETTINGS_FILE_NAME } from "../../src/storage/settings.ts";
import {
  agentDir,
  CHAINED_PROMPT,
  CONFIG_DIR_NAME,
  createHarness,
  cwd,
  styleFile,
  styleStatus,
  writeStyle,
} from "../support/extension-harness.ts";
import { deferred } from "../support/deferred.ts";
import { MemoryStylePersistence } from "../support/persistence.ts";

async function userStyles(): Promise<void> {
  const directory = join(agentDir, STYLES_DIR_NAME);
  await writeStyle(directory, "brief.md", styleFile("Brief.", "Be brief."));
  await writeStyle(directory, "terse.md", styleFile("Terse.", "One word."));
}

describe("persistence dependency", () => {
  it("reads and writes through the injected persistence", async () => {
    await userStyles();
    const persistence = new MemoryStylePersistence();
    const global = join(agentDir, SETTINGS_FILE_NAME);
    persistence.values.set(global, "brief");
    const harness = createHarness({ persistence });
    await harness.start();

    expect(persistence.reads).toEqual([global]);
    expect(harness.status()).toBe(styleStatus("brief"));
    await harness.runCommand("terse");
    expect(persistence.writes).toEqual([{ path: global, name: "terse" }]);
    expect(persistence.values.get(global)).toBe("terse");
  });

  it("reports a failed save while applying the style to the next turn", async () => {
    await userStyles();
    const persistence = new MemoryStylePersistence();
    persistence.writeFailures.set("brief", new Error("disk full"));
    const harness = createHarness({ persistence });
    await harness.start();
    await harness.runCommand("brief");

    expect(harness.status()).toBe(styleStatus("brief"));
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nBe brief.`);
    expect(harness.notifications).toEqual([
      { message: 'Output style "brief" is active from the next turn on.', level: "info" },
      {
        message: 'Output style "brief" stays active for this session but could not be persisted: disk full',
        level: "warning",
      },
    ]);
    await harness.runCommand("terse");
    expect(persistence.values.get(join(agentDir, SETTINGS_FILE_NAME))).toBe("terse");
  });

  it("applies a switch while its save is pending and preserves a later concurrent switch", async () => {
    await userStyles();
    const persistence = new MemoryStylePersistence();
    const gate = deferred<void>();
    persistence.writeGates.set("brief", gate.promise);
    const harness = createHarness({ persistence });
    await harness.start();
    const firstWrite = deferred<void>();
    const secondWrite = deferred<void>();
    persistence.writeStarted.set("brief", firstWrite);
    persistence.writeStarted.set("terse", secondWrite);
    const first = harness.runCommand("brief");
    await firstWrite.promise;

    expect(harness.status()).toBe(styleStatus("brief"));
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nBe brief.`);
    expect(persistence.values.has(join(agentDir, SETTINGS_FILE_NAME))).toBe(false);
    const second = harness.runCommand("terse");
    await secondWrite.promise;

    expect(harness.status()).toBe(styleStatus("terse"));
    expect(persistence.values.has(join(agentDir, SETTINGS_FILE_NAME))).toBe(false);
    gate.resolve();
    await Promise.all([first, second]);

    expect(persistence.writes.map((write) => write.name)).toEqual(["brief", "terse"]);
    expect(harness.status()).toBe(styleStatus("terse"));
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nOne word.`);
    expect(persistence.values.get(join(agentDir, SETTINGS_FILE_NAME))).toBe("terse");
  });

  it("uses global fallback after a failed project read and targets the project for writes", async () => {
    await userStyles();
    const persistence = new MemoryStylePersistence();
    const project = join(cwd, CONFIG_DIR_NAME, SETTINGS_FILE_NAME);
    const global = join(agentDir, SETTINGS_FILE_NAME);
    persistence.readFailures.set(project, "permission denied");
    persistence.values.set(global, "brief");
    const harness = createHarness({ persistence, trusted: true });
    await harness.start();

    expect(persistence.reads).toEqual([project, global]);
    expect(harness.status()).toBe(styleStatus("brief"));
    expect(harness.notifications[0]?.message).toContain(`could not be read: ${project} (permission denied)`);
    await harness.runCommand("terse");
    expect(persistence.writes).toEqual([{ path: project, name: "terse" }]);
  });

  it("does not consult an untrusted project's persisted selection", async () => {
    await userStyles();
    const persistence = new MemoryStylePersistence();
    persistence.values.set(join(cwd, CONFIG_DIR_NAME, SETTINGS_FILE_NAME), "terse");
    const harness = createHarness({ persistence });
    await harness.start();

    expect(persistence.reads).toEqual([join(agentDir, SETTINGS_FILE_NAME)]);
    expect(harness.status()).toBeUndefined();
    expect(harness.notifications).toEqual([]);
  });
});
