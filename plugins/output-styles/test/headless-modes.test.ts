import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STYLES_DIR_NAME } from "../lib/extension.js";
import { OUTPUT_STYLE_KEY, SETTINGS_FILE_NAME } from "../lib/settings.js";
import {
  agentDir,
  CHAINED_PROMPT,
  CONFIG_DIR_NAME,
  createHarness,
  cwd,
  styleFile,
  writeStyle,
} from "./support/extension-harness.js";

describe("modes without a user interface", () => {
  let stderrLines: string[];

  beforeEach(() => {
    stderrLines = [];
    vi.spyOn(process.stderr, "write").mockImplementation(((chunk: string | Uint8Array) => {
      stderrLines.push(String(chunk));
      return true;
    }) as typeof process.stderr.write);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function writeUserStyles(): Promise<void> {
    const userStyles = join(agentDir, STYLES_DIR_NAME);
    await writeStyle(userStyles, "brief.md", styleFile("Short answers.", "Answer briefly."));
    await writeStyle(userStyles, "terse.md", styleFile("One-line answers.", "Answer in one line."));
  }

  it("registers no cycle shortcut and sets no footer status", async () => {
    await writeUserStyles();
    const harness = createHarness({ hasUI: false });

    await harness.start();

    expect(harness.registeredShortcuts).toEqual([]);
    expect(harness.statusCalls).toEqual([]);
  });

  it("resolves a persisted style into the same prompt as with a user interface", async () => {
    await writeUserStyles();
    await mkdir(join(cwd, CONFIG_DIR_NAME), { recursive: true });
    await writeFile(
      join(cwd, CONFIG_DIR_NAME, SETTINGS_FILE_NAME),
      JSON.stringify({ [OUTPUT_STYLE_KEY]: "terse" }),
      "utf8",
    );

    const withUI = createHarness({ trusted: true, hasUI: true });
    await withUI.start();
    const withoutUI = createHarness({ trusted: true, hasUI: false });
    await withoutUI.start();

    const expected = `${CHAINED_PROMPT}\n\nAnswer in one line.`;
    expect(await withoutUI.turn()).toBe(expected);
    expect(await withUI.turn()).toBe(expected);
  });

  it("applies a flag-selected style without a user interface", async () => {
    await writeUserStyles();
    const harness = createHarness({ flag: "brief", hasUI: false });
    await harness.start();

    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer briefly.`);
  });

  it("switches by name through the command without opening a dialog", async () => {
    await writeUserStyles();
    const harness = createHarness({ hasUI: false });
    await harness.start();

    await harness.runCommand("terse");

    expect(harness.selectCalls).toEqual([]);
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer in one line.`);
  });

  it("reports the available names for the argument-less command instead of a dialog", async () => {
    await writeUserStyles();
    const harness = createHarness({ hasUI: false });
    await harness.start();

    await harness.runCommand("");

    expect(harness.selectCalls).toEqual([]);
    expect(stderrLines.join("")).toBe(
      'output-styles: Available output styles: default, brief, terse. The active style is "default". Switch with "/output-style <name>".\n',
    );
  });

  it("writes messages to standard error and never to the notify surface", async () => {
    const userStyles = join(agentDir, STYLES_DIR_NAME);
    await writeStyle(userStyles, "terse.md", styleFile("One-line answers.", "Answer in one line."));
    const malformed = await writeStyle(userStyles, "broken.md", "no frontmatter here\n");

    const harness = createHarness({ hasUI: false });
    await harness.start();

    expect(harness.notifications).toEqual([]);
    expect(stderrLines.join("")).toBe(
      `output-styles: Output style skipped: ${malformed} (no readable YAML frontmatter block)\n`,
    );
  });

  it("refuses the create flow with one explanatory message and writes no file", async () => {
    const stdoutLines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      stdoutLines.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    const harness = createHarness({ hasUI: false });
    await harness.start();

    await harness.runCommand("new");

    expect(stderrLines).toEqual([
      'output-styles: "/output-style new" needs a user interface: the create flow collects its inputs through dialogs. Write a style file into a style directory instead; the README section "Style File Format" describes the format.\n',
    ]);
    expect(stdoutLines).toEqual([]);
    expect(harness.inputCalls).toEqual([]);
    await expect(stat(join(agentDir, STYLES_DIR_NAME))).rejects.toThrow();
  });

  it("reports an unknown command argument on standard error and keeps the active style", async () => {
    await writeUserStyles();
    const harness = createHarness({ flag: "terse", hasUI: false });
    await harness.start();

    await harness.runCommand("missing");

    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer in one line.`);
    expect(stderrLines.join("")).toBe(
      'output-styles: Unknown output style "missing". The active style stays "terse". Available: default, brief, terse\n',
    );
  });
});
