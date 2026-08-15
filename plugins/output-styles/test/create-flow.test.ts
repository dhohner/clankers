import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STYLES_DIR_NAME } from "../lib/extension.js";
import { OUTPUT_STYLE_KEY, SETTINGS_FILE_NAME } from "../lib/settings.js";
import { parseStyleFile } from "../lib/style-file.js";
import {
  agentDir,
  bundledDir,
  CHAINED_PROMPT,
  CONFIG_DIR_NAME,
  createHarness,
  cwd,
  type Harness,
  styleFile,
  styleStatus,
  writeStyle,
} from "./support/extension-harness.js";

// File modes do not deny listing or access reliably on every OS or for a privileged user, so those
// failures are injected instead of provoked through the filesystem, mirroring discovery.test.ts.
// vi.mock and vi.hoisted are hoisted per test file, so this block cannot move into a shared module.
// `errors` is consumed one entry per denied listing and falls back to EACCES once it runs out, so a
// single invocation can see the same directory fail for two different reasons.
const listFailures = vi.hoisted(() => ({
  path: undefined as string | undefined,
  errors: [] as Array<{ message: string; code: string }>,
}));

// Same rationale for the create flow's collision check: an access denial is injected.
const accessFailures = vi.hoisted(() => ({ path: undefined as string | undefined }));

// Injected mid-write failure: partial content lands at the path before the rejection, mirroring
// an I/O error after the exclusive create already wrote data.
const writeFailures = vi.hoisted(() => ({ path: undefined as string | undefined }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const denied = (spec = { message: "EACCES: permission denied", code: "EACCES" }) =>
    Promise.reject(Object.assign(new Error(spec.message), { code: spec.code }));
  return {
    ...actual,
    readdir: (path: Parameters<typeof actual.readdir>[0], ...rest: unknown[]) =>
      String(path) === listFailures.path
        ? denied(listFailures.errors.shift())
        : (actual.readdir as (...args: unknown[]) => unknown)(path, ...rest),
    access: (path: Parameters<typeof actual.access>[0], ...rest: unknown[]) =>
      String(path) === accessFailures.path
        ? denied()
        : (actual.access as (...args: unknown[]) => unknown)(path, ...rest),
    writeFile: async (path: Parameters<typeof actual.writeFile>[0], ...rest: unknown[]) => {
      if (String(path) === writeFailures.path) {
        await actual.writeFile(path, "partial content", "utf8");
        throw Object.assign(new Error("EIO: i/o error"), { code: "EIO" });
      }
      return (actual.writeFile as (...args: unknown[]) => unknown)(path, ...rest);
    },
  };
});

afterEach(() => {
  listFailures.path = undefined;
  listFailures.errors = [];
  accessFailures.path = undefined;
  writeFailures.path = undefined;
});

describe("create flow (/output-style new)", () => {
  function userStylesDir(): string {
    return join(agentDir, STYLES_DIR_NAME);
  }

  function projectStylesDir(): string {
    return join(cwd, CONFIG_DIR_NAME, STYLES_DIR_NAME);
  }

  function userTargetLabel(): string {
    return `user - ${userStylesDir()}`;
  }

  async function readSettings(path: string): Promise<Record<string, unknown>> {
    return JSON.parse(await readFile(path, "utf8"));
  }

  it("creates a style through the dialogs, activates it, and persists the selection", async () => {
    const harness = createHarness({ trusted: true });
    await harness.start();
    await expect(stat(userStylesDir())).rejects.toThrow();

    harness.answerInput("brief");
    harness.answerInput("Short answers.");
    harness.answerSelect(userTargetLabel());
    harness.answerEditor("Answer briefly.\nSkip preamble.");
    await harness.runCommand("new");

    const path = join(userStylesDir(), "brief.md");
    const parsed = parseStyleFile(path, await readFile(path, "utf8"), "user");
    expect(parsed).toEqual({
      ok: true,
      style: {
        name: "brief",
        description: "Short answers.",
        mode: "append",
        instructions: "Answer briefly.\nSkip preamble.",
        source: "user",
        path,
      },
    });
    expect(harness.status()).toBe(styleStatus("brief"));
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer briefly.\nSkip preamble.`);
    expect(harness.notifications).toEqual([
      { message: 'Output style "brief" is active from the next turn on.', level: "info" },
    ]);
    expect(await readSettings(join(cwd, CONFIG_DIR_NAME, SETTINGS_FILE_NAME))).toEqual({
      [OUTPUT_STYLE_KEY]: "brief",
    });
  });

  it("round-trips a description with YAML-significant characters through the written file", async () => {
    const description = 'mode: no - he said "quote me: now"';
    const harness = createHarness();
    await harness.start();

    harness.answerInput("tricky");
    harness.answerInput(description);
    harness.answerEditor("Body text.");
    await harness.runCommand("new");

    const path = join(userStylesDir(), "tricky.md");
    const parsed = parseStyleFile(path, await readFile(path, "utf8"), "user");
    expect(parsed.ok && parsed.style.description).toBe(description);
    expect(parsed.ok && parsed.style.instructions).toBe("Body text.");
  });

  it.each([
    ["name", (harness: Harness) => harness.answerInput(undefined)],
    [
      "description",
      (harness: Harness) => {
        harness.answerInput("brief");
        harness.answerInput(undefined);
      },
    ],
    [
      "target",
      (harness: Harness) => {
        harness.answerInput("brief");
        harness.answerInput("Short answers.");
        harness.answerSelect(undefined);
      },
    ],
    [
      "body",
      (harness: Harness) => {
        harness.answerInput("brief");
        harness.answerInput("Short answers.");
        harness.answerSelect(`user - ${join(agentDir, STYLES_DIR_NAME)}`);
        harness.answerEditor(undefined);
      },
    ],
  ])("cancelling the %s dialog writes nothing and keeps the active style", async (_dialog, queueAnswers) => {
    const harness = createHarness({ trusted: true });
    await harness.start();

    queueAnswers(harness);
    await harness.runCommand("new");

    await expect(stat(userStylesDir())).rejects.toThrow();
    await expect(stat(projectStylesDir())).rejects.toThrow();
    expect(harness.status()).toBeUndefined();
    expect(harness.notifications).toEqual([]);
  });

  it.each([
    ["", "the name is empty"],
    ["   ", "the name is empty"],
    ["default", 'the name "default" is reserved'],
    ["new", 'the name "new" is reserved'],
    ["bad name", "the name may only contain letters, digits, dash, and underscore"],
    ["../escape", "the name may only contain letters, digits, dash, and underscore"],
  ])("refuses the name %j with a reason and re-opens the dialog", async (name, reason) => {
    const harness = createHarness();
    await harness.start();

    harness.answerInput(name);
    harness.answerInput(undefined);
    await harness.runCommand("new");

    expect(harness.inputCalls).toHaveLength(2);
    expect(harness.notifications).toEqual([{ message: `Style name refused: ${reason}.`, level: "warning" }]);
    await expect(stat(userStylesDir())).rejects.toThrow();
  });

  it("refuses a blank description with a reason and re-opens the dialog", async () => {
    const harness = createHarness();
    await harness.start();

    harness.answerInput("brief");
    harness.answerInput("   ");
    harness.answerInput(undefined);
    await harness.runCommand("new");

    expect(harness.inputCalls).toHaveLength(3);
    expect(harness.notifications).toEqual([
      { message: "Style description refused: the description is empty.", level: "warning" },
    ]);
    await expect(stat(userStylesDir())).rejects.toThrow();
  });

  it("refuses a blank instruction body with a reason and re-opens the editor", async () => {
    const harness = createHarness();
    await harness.start();

    harness.answerInput("brief");
    harness.answerInput("Short answers.");
    harness.answerEditor("  \n\t");
    harness.answerEditor(undefined);
    await harness.runCommand("new");

    expect(harness.editorCalls).toHaveLength(2);
    expect(harness.notifications).toEqual([
      { message: "Style instructions refused: the instruction text is empty.", level: "warning" },
    ]);
    await expect(stat(userStylesDir())).rejects.toThrow();
  });

  it("refuses a description with outer whitespace and writes the retyped value back exactly", async () => {
    const harness = createHarness();
    await harness.start();

    harness.answerInput("brief");
    harness.answerInput("  Short answers.  ");
    harness.answerInput("Short answers.");
    harness.answerEditor("Answer briefly.");
    await harness.runCommand("new");

    expect(harness.inputCalls).toHaveLength(3);
    const path = join(userStylesDir(), "brief.md");
    const parsed = parseStyleFile(path, await readFile(path, "utf8"), "user");
    expect(parsed.ok && parsed.style.description).toBe("Short answers.");
    expect(harness.notifications).toEqual([
      {
        message:
          "Style description refused: remove the leading and trailing whitespace, which does not survive a reread of the file.",
        level: "warning",
      },
      { message: 'Output style "brief" is active from the next turn on.', level: "info" },
    ]);
  });

  it("refuses a trailing newline like any other outer whitespace instead of stripping it", async () => {
    const harness = createHarness();
    await harness.start();

    harness.answerInput("brief");
    harness.answerInput("Short answers.");
    // Pi strips its external editor's terminating newline itself, so a trailing newline in the
    // result is entered content and must not be changed silently.
    harness.answerEditor("Answer briefly.\nSkip preamble.\n");
    harness.answerEditor("Answer briefly.\nSkip preamble.");
    await harness.runCommand("new");

    expect(harness.editorCalls).toEqual([
      { title: "Instruction text of the new style", prefill: undefined },
      { title: "Instruction text of the new style", prefill: "Answer briefly.\nSkip preamble." },
    ]);
    const path = join(userStylesDir(), "brief.md");
    const parsed = parseStyleFile(path, await readFile(path, "utf8"), "user");
    expect(parsed.ok && parsed.style.instructions).toBe("Answer briefly.\nSkip preamble.");
    expect(harness.notifications).toEqual([
      {
        message:
          "Style instructions refused: remove the leading and trailing whitespace, which does not survive a reread of the file. The editor re-opens with the trimmed text.",
        level: "warning",
      },
      { message: 'Output style "brief" is active from the next turn on.', level: "info" },
    ]);
  });

  it("refuses instruction text with outer whitespace and re-opens the editor with the trimmed text", async () => {
    const harness = createHarness();
    await harness.start();

    harness.answerInput("brief");
    harness.answerInput("Short answers.");
    harness.answerEditor("\nAnswer briefly.\n\n");
    harness.answerEditor("Answer briefly.");
    await harness.runCommand("new");

    expect(harness.editorCalls).toEqual([
      { title: "Instruction text of the new style", prefill: undefined },
      { title: "Instruction text of the new style", prefill: "Answer briefly." },
    ]);
    const path = join(userStylesDir(), "brief.md");
    const parsed = parseStyleFile(path, await readFile(path, "utf8"), "user");
    expect(parsed.ok && parsed.style.instructions).toBe("Answer briefly.");
    expect(harness.notifications).toEqual([
      {
        message:
          "Style instructions refused: remove the leading and trailing whitespace, which does not survive a reread of the file. The editor re-opens with the trimmed text.",
        level: "warning",
      },
      { message: 'Output style "brief" is active from the next turn on.', level: "info" },
    ]);
  });

  it("does not activate from the previous list when the post-write rescan is not adopted", async () => {
    await writeStyle(bundledDir, "plain.md", styleFile("Bundled style.", "Bundled text."));
    const harness = createHarness();
    await harness.start();

    // The user style directory becomes unlistable before the command runs, so neither the
    // handler-start scan nor the post-write scan adopts a fresh list. The previous list still
    // offers the bundled "plain", which must not activate in place of the just-written file.
    listFailures.path = userStylesDir();
    harness.answerInput("plain");
    harness.answerInput("User override.");
    harness.answerEditor("User text.");
    await harness.runCommand("new");

    const path = join(userStylesDir(), "plain.md");
    expect(parseStyleFile(path, await readFile(path, "utf8"), "user").ok).toBe(true);
    expect(harness.status()).toBeUndefined();
    expect(await harness.turn()).toBe(CHAINED_PROMPT);
    expect(harness.notifications).toEqual([
      {
        message: `Output styles keep the previous list: ${userStylesDir()} (cannot list directory: EACCES: permission denied)`,
        level: "warning",
      },
      {
        message: `The style file was written to ${path}, but the current style list does not offer "plain".`,
        level: "warning",
      },
    ]);
  });

  it("reports the kept list once per directory even when the failure reason changes between the two scans", async () => {
    const harness = createHarness();
    await harness.start();

    // The handler-start scan and the post-write scan both fail on the same directory, but with
    // different reasons. That is one affected directory in one invocation, so it earns one warning.
    listFailures.path = userStylesDir();
    listFailures.errors = [
      { message: "EACCES: permission denied", code: "EACCES" },
      { message: "EPERM: operation not permitted", code: "EPERM" },
    ];
    harness.answerInput("brief");
    harness.answerInput("Short answers.");
    harness.answerEditor("Answer briefly.");
    await harness.runCommand("new");

    const path = join(userStylesDir(), "brief.md");
    expect(parseStyleFile(path, await readFile(path, "utf8"), "user").ok).toBe(true);
    expect(listFailures.errors).toEqual([]);
    expect(harness.notifications).toEqual([
      {
        message: `Output styles keep the previous list: ${userStylesDir()} (cannot list directory: EACCES: permission denied)`,
        level: "warning",
      },
      {
        message: `The style file was written to ${path}, but the current style list does not offer "brief".`,
        level: "warning",
      },
    ]);
  });

  it("stops before the editor and reports when the collision check itself fails", async () => {
    accessFailures.path = join(userStylesDir(), "brief.md");
    const harness = createHarness();
    await harness.start();

    harness.answerInput("brief");
    harness.answerInput("Short answers.");
    harness.answerEditor("Never reached.");
    await harness.runCommand("new");

    expect(harness.editorCalls).toEqual([]);
    expect(harness.notifications).toEqual([
      {
        message: `Style "brief" was not created: cannot check ${join(userStylesDir(), "brief.md")}: EACCES: permission denied`,
        level: "error",
      },
    ]);
    await expect(stat(userStylesDir())).rejects.toThrow();
  });

  it("reports a file that appeared after the check and neither overwrites nor deletes it", async () => {
    const raced = styleFile("Raced.", "Raced text.");
    const harness = createHarness();
    await harness.start();

    harness.answerInput("brief");
    harness.answerInput("Short answers.");
    // The colliding file appears while the editor is open, after the collision check passed, so
    // only the exclusive "wx" write can catch it.
    harness.answerEditor(async () => {
      await writeStyle(userStylesDir(), "brief.md", raced);
      return "Answer briefly.";
    });
    await harness.runCommand("new");

    expect(harness.notifications).toHaveLength(1);
    expect(harness.notifications[0]?.level).toBe("error");
    expect(harness.notifications[0]?.message).toContain('Style "brief" was not created:');
    expect(await readFile(join(userStylesDir(), "brief.md"), "utf8")).toBe(raced);
    expect(await readdir(userStylesDir())).toEqual(["brief.md"]);
    expect(harness.status()).toBeUndefined();
  });

  it("reports the possible partial file of a failed write instead of removing it", async () => {
    const path = join(agentDir, STYLES_DIR_NAME, "brief.md");
    writeFailures.path = path;
    const harness = createHarness();
    await harness.start();

    harness.answerInput("brief");
    harness.answerInput("Short answers.");
    harness.answerEditor("Answer briefly.");
    await harness.runCommand("new");

    // The path may no longer hold this flow's file when the write handler runs, so the leftover
    // is reported for manual removal, never removed by path.
    expect(harness.notifications).toEqual([
      { message: `An incomplete file may remain at ${path}. Remove it before the name is retried.`, level: "warning" },
      { message: 'Style "brief" was not created: EIO: i/o error', level: "error" },
    ]);
    expect(await readFile(path, "utf8")).toBe("partial content");
    expect(harness.status()).toBeUndefined();
  });

  it("refuses a name whose file already exists in the chosen directory", async () => {
    const original = styleFile("Existing style.", "Existing text.");
    const path = await writeStyle(userStylesDir(), "terse.md", original);
    const harness = createHarness();
    await harness.start();

    harness.answerInput("terse");
    harness.answerInput("A second terse.");
    harness.answerEditor("Never reached.");
    await harness.runCommand("new");

    expect(harness.editorCalls).toEqual([]);
    expect(harness.notifications).toEqual([
      {
        message: `Style "terse" was not created: ${path} already exists. Choose a different name.`,
        level: "warning",
      },
    ]);
    expect(await readFile(path, "utf8")).toBe(original);
    expect(harness.status()).toBeUndefined();
  });

  it("accepts a name that only shadows a style from another source and activates the winner", async () => {
    await writeStyle(bundledDir, "plain.md", styleFile("Bundled style.", "Bundled text."));
    const harness = createHarness();
    await harness.start();

    harness.answerInput("plain");
    harness.answerInput("User override.");
    harness.answerEditor("User text.");
    await harness.runCommand("new");

    const path = join(userStylesDir(), "plain.md");
    expect(parseStyleFile(path, await readFile(path, "utf8"), "user").ok).toBe(true);
    expect(harness.status()).toBe(styleStatus("plain"));
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nUser text.`);
  });

  it("skips the target dialog in an untrusted project and writes to the user directory", async () => {
    const harness = createHarness({ trusted: false });
    await harness.start();

    harness.answerInput("brief");
    harness.answerInput("Short answers.");
    harness.answerEditor("Answer briefly.");
    await harness.runCommand("new");

    expect(harness.selectCalls).toEqual([]);
    await expect(stat(join(userStylesDir(), "brief.md"))).resolves.toBeDefined();
    await expect(stat(projectStylesDir())).rejects.toThrow();
    expect(await readSettings(join(agentDir, SETTINGS_FILE_NAME))).toEqual({ [OUTPUT_STYLE_KEY]: "brief" });
  });

  it("offers both directories in a trusted project and writes to the chosen project directory", async () => {
    const harness = createHarness({ trusted: true });
    await harness.start();

    harness.answerInput("brief");
    harness.answerInput("Short answers.");
    harness.answerSelect(`project - ${projectStylesDir()}`);
    harness.answerEditor("Answer briefly.");
    await harness.runCommand("new");

    expect(harness.selectCalls).toEqual([
      {
        title: "Directory for the new style",
        options: [userTargetLabel(), `project - ${projectStylesDir()}`],
      },
    ]);
    const path = join(projectStylesDir(), "brief.md");
    expect(parseStyleFile(path, await readFile(path, "utf8"), "project").ok).toBe(true);
    await expect(stat(userStylesDir())).rejects.toThrow();
    expect(harness.status()).toBe(styleStatus("brief"));
  });

  it("reports a failed write and keeps the active style and the settings untouched", async () => {
    // A regular file at the style directory path makes the mkdir of the write step fail.
    await mkdir(agentDir, { recursive: true });
    await writeFile(userStylesDir(), "not a directory", "utf8");
    const harness = createHarness();
    await harness.start();

    harness.answerInput("brief");
    harness.answerInput("Short answers.");
    harness.answerEditor("Answer briefly.");
    await harness.runCommand("new");

    // The file at the directory path also makes the scans report an unlistable directory, so only
    // the error level identifies the write-failure report.
    const failure = harness.notifications.find((notification) => notification.level === "error");
    expect(failure?.message).toContain('Style "brief" was not created:');
    expect(harness.status()).toBeUndefined();
    await expect(readFile(join(agentDir, SETTINGS_FILE_NAME), "utf8")).rejects.toThrow();
  });

  it("never opens the selector or the name-switch path for the exact argument", async () => {
    const harness = createHarness();
    await harness.start();

    harness.answerInput(undefined);
    await harness.runCommand("new");

    expect(harness.selectCalls).toEqual([]);
    expect(harness.inputCalls).toHaveLength(1);
    expect(harness.notifications).toEqual([]);
  });
});
