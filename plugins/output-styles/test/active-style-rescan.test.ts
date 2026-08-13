import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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

// File modes do not deny listing reliably on every OS or for a privileged user, so the listing
// failure is injected instead of provoked through the filesystem, mirroring discovery.test.ts.
// vi.mock and vi.hoisted are hoisted per test file, so this block cannot move into a shared module.
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

describe("active style follows its file after a rescan", () => {
  const terse = () => styleFile("One-line answers.", "Answer in one line.");

  const fallbackReport = {
    message: 'Output style "terse" is no longer available. The built-in "default" style is now active.',
    level: "warning",
  };

  async function persistProjectStyle(name: string): Promise<{ path: string; content: string }> {
    const path = join(cwd, CONFIG_DIR_NAME, SETTINGS_FILE_NAME);
    const content = JSON.stringify({ [OUTPUT_STYLE_KEY]: name }, null, 2);
    await mkdir(join(cwd, CONFIG_DIR_NAME), { recursive: true });
    await writeFile(path, content, "utf8");
    return { path, content };
  }

  it("applies an edited active style from the next turn without a fallback report", async () => {
    const path = await writeStyle(join(agentDir, STYLES_DIR_NAME), "terse.md", terse());
    const harness = createHarness({ flag: "terse" });
    await harness.start();
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer in one line.`);

    await writeFile(path, styleFile("One-line answers.", "Answer in exactly one word."), "utf8");
    harness.answerSelect(undefined);
    await harness.runCommand("");

    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer in exactly one word.`);
    expect(harness.status()).toBe(styleStatus("terse"));
    expect(harness.notifications).toEqual([]);
  });

  it("falls back to default when the active style's file is deleted, without a settings write", async () => {
    const stylePath = await writeStyle(join(agentDir, STYLES_DIR_NAME), "terse.md", terse());
    const settings = await persistProjectStyle("terse");
    const harness = createHarness({ trusted: true });
    await harness.start();
    expect(harness.status()).toBe(styleStatus("terse"));

    await rm(stylePath);
    harness.answerSelect(undefined);
    await harness.runCommand("");

    expect(harness.status()).toBeUndefined();
    expect(harness.notifications).toEqual([fallbackReport]);
    expect(await readFile(settings.path, "utf8")).toBe(settings.content);
    expect(await harness.turn()).toBe(CHAINED_PROMPT);
  });

  it("falls back to default when the active style's file becomes malformed", async () => {
    const stylePath = await writeStyle(join(agentDir, STYLES_DIR_NAME), "terse.md", terse());
    const settings = await persistProjectStyle("terse");
    const harness = createHarness({ trusted: true });
    await harness.start();

    await writeFile(stylePath, "no frontmatter here\n", "utf8");
    harness.answerSelect(undefined);
    await harness.runCommand("");

    expect(harness.status()).toBeUndefined();
    expect(harness.notifications).toEqual([
      { message: `Output style skipped: ${stylePath} (no readable YAML frontmatter block)`, level: "warning" },
      fallbackReport,
    ]);
    expect(await readFile(settings.path, "utf8")).toBe(settings.content);
    expect(await harness.turn()).toBe(CHAINED_PROMPT);
  });

  it("reports the fallback once across repeated invocations while the file stays absent", async () => {
    const stylePath = await writeStyle(join(agentDir, STYLES_DIR_NAME), "terse.md", terse());
    const harness = createHarness({ flag: "terse" });
    await harness.start();

    await rm(stylePath);
    harness.answerSelect(undefined);
    await harness.runCommand("");
    harness.answerSelect(undefined);
    await harness.runCommand("");

    expect(harness.status()).toBeUndefined();
    expect(harness.notifications).toEqual([fallbackReport]);
  });

  it("re-resolves before the named argument acts, so the fallback and the switch both happen", async () => {
    const userStyles = join(agentDir, STYLES_DIR_NAME);
    const stylePath = await writeStyle(userStyles, "terse.md", terse());
    await writeStyle(userStyles, "brief.md", styleFile("Short answers.", "Answer briefly."));
    const harness = createHarness({ flag: "terse" });
    await harness.start();

    await rm(stylePath);
    await harness.runCommand("brief");

    expect(harness.status()).toBe(styleStatus("brief"));
    expect(harness.notifications).toEqual([
      fallbackReport,
      { message: 'Output style "brief" is active from the next turn on.', level: "info" },
    ]);
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer briefly.`);
  });

  it("applies an edited mode change of the active style from the next turn", async () => {
    const path = await writeStyle(join(agentDir, STYLES_DIR_NAME), "terse.md", terse());
    const harness = createHarness({ flag: "terse" });
    await harness.start();
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer in one line.`);

    await writeFile(path, styleFile("One-line answers.", "Answer like a pirate.", "replace"), "utf8");
    harness.answerSelect(undefined);
    await harness.runCommand("");

    const prompt = await harness.turn();
    expect(prompt).toContain("Answer like a pirate.");
    expect(prompt).not.toContain(CHAINED_PROMPT);
    expect(harness.notifications).toEqual([]);
  });

  it("marks default active in the selector of the invocation whose rescan lost the style", async () => {
    const stylePath = await writeStyle(join(agentDir, STYLES_DIR_NAME), "terse.md", terse());
    const harness = createHarness({ flag: "terse" });
    await harness.start();

    await rm(stylePath);
    harness.answerSelect(undefined);
    await harness.runCommand("");

    expect(harness.selectCalls[0]?.options).toEqual([
      "default (active) - Pi's standard behavior, with no added style instructions. [bundled]",
    ]);
  });

  it("does not fall back on a scan that keeps the previous list", async () => {
    const userStyles = join(agentDir, STYLES_DIR_NAME);
    const stylePath = await writeStyle(userStyles, "terse.md", terse());
    const harness = createHarness();
    await harness.start();

    // Holds the selector open over a snapshot that still offers "terse" while a concurrent
    // invocation adopts a fresh list without it, then picks "terse": the active name is now
    // absent from the adopted list, so only the gating decides whether a later scan falls back.
    let releaseSelect = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseSelect = resolve;
    });
    harness.answerSelect(async () => {
      await gate;
      return "terse - One-line answers. [user]";
    });
    const selecting = harness.runCommand("");
    await vi.waitFor(() => expect(harness.selectCalls).toHaveLength(1));
    await rm(stylePath);
    await harness.runCommand("default");
    releaseSelect();
    await selecting;
    expect(harness.status()).toBe(styleStatus("terse"));

    listFailures.path = userStyles;
    harness.answerSelect(undefined);
    await harness.runCommand("");

    expect(harness.status()).toBe(styleStatus("terse"));
    expect(harness.notifications).toEqual([
      { message: 'Output style "default" is active from the next turn on.', level: "info" },
      { message: 'Output style "terse" is active from the next turn on.', level: "info" },
      {
        message: `Output styles keep the previous list: ${userStyles} (cannot list directory: EACCES: permission denied)`,
        level: "warning",
      },
    ]);

    // The next adopted scan re-resolves and falls back, so the gating delays, never loses, it.
    listFailures.path = undefined;
    harness.answerSelect(undefined);
    await harness.runCommand("");

    expect(harness.status()).toBeUndefined();
    expect(harness.notifications).toHaveLength(4);
    expect(harness.notifications[3]).toEqual(fallbackReport);
  });

  it("keeps the name active through a same-name style from another source when its file is deleted", async () => {
    await writeStyle(join(agentDir, STYLES_DIR_NAME), "terse.md", styleFile("User terse.", "User terse text."));
    const projectPath = await writeStyle(
      join(cwd, CONFIG_DIR_NAME, STYLES_DIR_NAME),
      "terse.md",
      styleFile("Project terse.", "Project terse text."),
    );
    const harness = createHarness({ flag: "terse", trusted: true });
    await harness.start();
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nProject terse text.`);

    await rm(projectPath);
    harness.answerSelect(undefined);
    await harness.runCommand("");

    expect(harness.status()).toBe(styleStatus("terse"));
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nUser terse text.`);
    expect(harness.notifications).toEqual([]);
  });
});
