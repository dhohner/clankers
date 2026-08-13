import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STYLES_DIR_NAME } from "../lib/extension.js";
import { OUTPUT_STYLE_KEY, SETTINGS_FILE_NAME } from "../lib/settings.js";
import {
  agentDir,
  CHAINED_PROMPT,
  CONFIG_DIR_NAME,
  createHarness,
  cwd,
  styleFile,
  styleStatus,
  writeStyle,
} from "./support/extension-harness.js";

describe("style persistence", () => {
  function projectSettingsPath(): string {
    return join(cwd, CONFIG_DIR_NAME, SETTINGS_FILE_NAME);
  }

  function globalSettingsPath(): string {
    return join(agentDir, SETTINGS_FILE_NAME);
  }

  async function writeSettings(path: string, settings: Record<string, unknown>): Promise<void> {
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, JSON.stringify(settings, null, 2), "utf8");
  }

  async function readSettings(path: string): Promise<Record<string, unknown>> {
    return JSON.parse(await readFile(path, "utf8"));
  }

  async function writeUserStyles(): Promise<void> {
    const userStyles = join(agentDir, STYLES_DIR_NAME);
    await writeStyle(userStyles, "brief.md", styleFile("Short answers.", "Answer briefly."));
    await writeStyle(userStyles, "terse.md", styleFile("One-line answers.", "Answer in one line."));
  }

  it("persists a switch to the project settings file in a trusted project", async () => {
    await writeUserStyles();
    const harness = createHarness({ trusted: true });
    await harness.start();

    await harness.runCommand("terse");

    expect(await readSettings(projectSettingsPath())).toEqual({ [OUTPUT_STYLE_KEY]: "terse" });
    await expect(readFile(globalSettingsPath(), "utf8")).rejects.toThrow();
  });

  it("persists a switch to the global settings file in an untrusted project", async () => {
    await writeUserStyles();
    const harness = createHarness({ trusted: false });
    await harness.start();

    await harness.runCommand("terse");

    expect(await readSettings(globalSettingsPath())).toEqual({ [OUTPUT_STYLE_KEY]: "terse" });
    await expect(readFile(projectSettingsPath(), "utf8")).rejects.toThrow();
  });

  it("changes only the outputStyle key and keeps unrelated keys, nested objects included", async () => {
    await writeUserStyles();
    const unrelated = {
      theme: "dark",
      compaction: { enabled: true, threshold: 0.8 },
      warnings: { muted: ["tool-output"] },
    };
    await writeSettings(projectSettingsPath(), { ...unrelated, [OUTPUT_STYLE_KEY]: "brief" });

    const harness = createHarness({ trusted: true });
    await harness.start();
    await harness.runCommand("terse");

    expect(await readSettings(projectSettingsPath())).toEqual({ ...unrelated, [OUTPUT_STYLE_KEY]: "terse" });
  });

  it("activates the persisted style in the next session without a flag", async () => {
    await writeUserStyles();
    const firstSession = createHarness({ trusted: true });
    await firstSession.start();
    await firstSession.runCommand("terse");

    const secondSession = createHarness({ trusted: true });
    await secondSession.start();

    expect(secondSession.status()).toBe(styleStatus("terse"));
    expect(await secondSession.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer in one line.`);
    expect(secondSession.notifications).toEqual([]);
  });

  it("prefers the persisted project value over the persisted global value", async () => {
    await writeUserStyles();
    await writeSettings(projectSettingsPath(), { [OUTPUT_STYLE_KEY]: "terse" });
    await writeSettings(globalSettingsPath(), { [OUTPUT_STYLE_KEY]: "brief" });

    const harness = createHarness({ trusted: true });
    await harness.start();

    expect(harness.status()).toBe(styleStatus("terse"));
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer in one line.`);
  });

  it("ignores the project settings file in an untrusted project", async () => {
    await writeUserStyles();
    await writeSettings(projectSettingsPath(), { [OUTPUT_STYLE_KEY]: "terse" });
    await writeSettings(globalSettingsPath(), { [OUTPUT_STYLE_KEY]: "brief" });

    const harness = createHarness({ trusted: false });
    await harness.start();

    expect(harness.status()).toBe(styleStatus("brief"));
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer briefly.`);
    expect(harness.notifications).toEqual([]);
  });

  it("lets the flag win over a persisted value without changing the file", async () => {
    await writeUserStyles();
    await writeSettings(projectSettingsPath(), { [OUTPUT_STYLE_KEY]: "terse" });

    const harness = createHarness({ flag: "brief", trusted: true });
    await harness.start();

    expect(harness.status()).toBe(styleStatus("brief"));
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer briefly.`);
    expect(await readSettings(projectSettingsPath())).toEqual({ [OUTPUT_STYLE_KEY]: "terse" });
  });

  it("never writes a flag-selected style to settings", async () => {
    await writeUserStyles();
    const harness = createHarness({ flag: "brief", trusted: true });
    await harness.start();
    await harness.turn();

    await expect(readFile(projectSettingsPath(), "utf8")).rejects.toThrow();
    await expect(readFile(globalSettingsPath(), "utf8")).rejects.toThrow();
  });

  it("falls back through an unknown flag to the persisted value", async () => {
    await writeUserStyles();
    await writeSettings(projectSettingsPath(), { [OUTPUT_STYLE_KEY]: "terse" });

    const harness = createHarness({ flag: "missing", trusted: true });
    await harness.start();

    expect(harness.status()).toBe(styleStatus("terse"));
    expect(harness.notifications).toEqual([
      {
        message: 'Unknown output style "missing". Using "terse". Available: default, brief, terse',
        level: "warning",
      },
    ]);
  });

  it("reports an unknown persisted name once, uses default, and leaves the file unchanged", async () => {
    await writeUserStyles();
    await writeSettings(projectSettingsPath(), { [OUTPUT_STYLE_KEY]: "vanished", theme: "dark" });

    const harness = createHarness({ trusted: true });
    await harness.start();
    await harness.turn();

    expect(harness.status()).toBeUndefined();
    expect(await harness.turn()).toBe(CHAINED_PROMPT);
    expect(harness.notifications).toEqual([
      {
        message:
          'Unknown output style "vanished" persisted in project settings. Using "default". Available: default, brief, terse',
        level: "warning",
      },
    ]);
    expect(await readSettings(projectSettingsPath())).toEqual({ [OUTPUT_STYLE_KEY]: "vanished", theme: "dark" });
  });

  it("keeps the switch active and reports when the settings file cannot be written", async () => {
    await writeUserStyles();
    // A directory at the settings path makes both the read and the write of the persist step fail.
    await mkdir(projectSettingsPath(), { recursive: true });

    const harness = createHarness({ trusted: true });
    await harness.start();
    await harness.runCommand("terse");

    expect(harness.status()).toBe(styleStatus("terse"));
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer in one line.`);
    expect(harness.notifications).toHaveLength(2);
    expect(harness.notifications[1]?.level).toBe("warning");
    expect(harness.notifications[1]?.message).toContain('Output style "terse" stays active for this session but could not be persisted:');
  });

  it("persists a switch made through the cycle shortcut", async () => {
    await writeUserStyles();
    const harness = createHarness({ trusted: true });
    await harness.start();

    await harness.pressCycleShortcut();

    expect(harness.status()).toBe(styleStatus("brief"));
    expect(await readSettings(projectSettingsPath())).toEqual({ [OUTPUT_STYLE_KEY]: "brief" });
  });
});
