import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMMAND_NAME, CYCLE_SHORTCUT, STATUS_KEY, STYLES_DIR_NAME } from "../lib/extension.js";
import {
  agentDir,
  bundledDir,
  CHAINED_PROMPT,
  CONFIG_DIR_NAME,
  createHarness,
  cwd,
  styleFile,
  styleStatus,
  writeStyle,
} from "./support/extension-harness.js";

describe("in-session style switching", () => {
  async function writeUserStyles(): Promise<void> {
    const userStyles = join(agentDir, STYLES_DIR_NAME);
    await writeStyle(userStyles, "brief.md", styleFile("Short answers.", "Answer briefly."));
    await writeStyle(userStyles, "terse.md", styleFile("One-line answers.", "Answer in one line."));
  }

  it("registers the command at load and the cycle shortcut at session start", async () => {
    const harness = createHarness();

    expect(harness.registeredCommands.map((command) => command.name)).toEqual([COMMAND_NAME]);
    expect(harness.registeredShortcuts).toEqual([]);

    await harness.start();

    expect(harness.registeredShortcuts.map((shortcut) => shortcut.shortcut)).toEqual([CYCLE_SHORTCUT]);
  });

  it("registers the cycle shortcut once across repeated session starts", async () => {
    const harness = createHarness();

    await harness.start();
    await harness.start();

    expect(harness.registeredShortcuts.map((shortcut) => shortcut.shortcut)).toEqual([CYCLE_SHORTCUT]);
  });

  it("shows the default style in the footer from session start on", async () => {
    const harness = createHarness();
    await harness.start();

    expect(harness.status()).toBeUndefined();
  });

  // Pi bakes theme colors into the status text, so an entry set once keeps the colors of the theme
  // that was active then. Every turn renders it again, which picks up a theme switched in between.
  it("renders the footer entry again on every turn", async () => {
    await writeUserStyles();
    const harness = createHarness();
    await harness.start();
    await harness.runCommand("terse");
    const beforeTurn = harness.statusCalls.length;

    await harness.turn();

    expect(harness.statusCalls.slice(beforeTurn)).toEqual([{ key: STATUS_KEY, text: styleStatus("terse") }]);
  });

  it("switches directly to a named style for the next turn and updates the footer", async () => {
    await writeUserStyles();
    const harness = createHarness();
    await harness.start();
    expect(await harness.turn()).toBe(CHAINED_PROMPT);

    await harness.runCommand("terse");

    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer in one line.`);
    expect(harness.status()).toBe(styleStatus("terse"));
    expect(harness.notifications).toEqual([
      { message: 'Output style "terse" is active from the next turn on.', level: "info" },
    ]);
  });

  it("replaces a flag-selected style for the rest of the session", async () => {
    await writeUserStyles();
    const harness = createHarness({ flag: "brief" });
    await harness.start();
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer briefly.`);

    await harness.runCommand("terse");

    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer in one line.`);
  });

  it("keeps the active style and reports an unknown command argument", async () => {
    await writeUserStyles();
    const harness = createHarness({ flag: "terse" });
    await harness.start();

    await harness.runCommand("missing");

    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer in one line.`);
    expect(harness.status()).toBe(styleStatus("terse"));
    expect(harness.notifications).toEqual([
      {
        message: 'Unknown output style "missing". The active style stays "terse". Available: default, brief, terse',
        level: "warning",
      },
    ]);
  });

  it.each([
    ["a leading space", " terse"],
    ["a trailing space", "terse "],
    ["only whitespace", "  "],
  ])("treats an argument with %s as an unknown name instead of trimming it", async (_case, argument) => {
    await writeUserStyles();
    const harness = createHarness({ flag: "brief" });
    await harness.start();

    await harness.runCommand(argument);

    expect(harness.selectCalls).toEqual([]);
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer briefly.`);
    expect(harness.status()).toBe(styleStatus("brief"));
    expect(harness.notifications).toEqual([
      {
        message: `Unknown output style "${argument}". The active style stays "brief". Available: default, brief, terse`,
        level: "warning",
      },
    ]);
  });

  it("switches to the same style again without an error and without a change", async () => {
    await writeUserStyles();
    const harness = createHarness({ flag: "terse" });
    await harness.start();

    await harness.runCommand("terse");

    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer in one line.`);
    expect(harness.status()).toBe(styleStatus("terse"));
    expect(harness.notifications).toEqual([
      { message: 'Output style "terse" is active from the next turn on.', level: "info" },
    ]);
  });

  it("lists every style with name, description, and source and marks the active one", async () => {
    await writeStyle(bundledDir, "plain.md", styleFile("Bundled style.", "Bundled text."));
    await writeStyle(join(agentDir, STYLES_DIR_NAME), "brief.md", styleFile("User style.", "User text."));
    await writeStyle(join(cwd, CONFIG_DIR_NAME, STYLES_DIR_NAME), "local.md", styleFile("Project style.", "Project text."));

    const harness = createHarness({ flag: "brief", trusted: true });
    await harness.start();
    harness.answerSelect(undefined);
    await harness.runCommand("");

    expect(harness.selectCalls).toEqual([
      {
        title: "Select output style",
        options: [
          "default - Pi's standard behavior, with no added style instructions. [bundled]",
          "brief (active) - User style. [user]",
          "local - Project style. [project]",
          "plain - Bundled style. [bundled]",
        ],
      },
    ]);
  });

  it("switches to the style picked in the selector", async () => {
    await writeUserStyles();
    const harness = createHarness();
    await harness.start();

    harness.answerSelect("terse - One-line answers. [user]");
    await harness.runCommand("");

    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer in one line.`);
    expect(harness.status()).toBe(styleStatus("terse"));
  });

  it("keeps the active style when the selector is cancelled", async () => {
    await writeUserStyles();
    const harness = createHarness({ flag: "brief" });
    await harness.start();

    harness.answerSelect(undefined);
    await harness.runCommand("");

    expect(harness.selectCalls).toHaveLength(1);
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer briefly.`);
    expect(harness.status()).toBe(styleStatus("brief"));
    expect(harness.notifications).toEqual([]);
  });

  it("offers the discovered style names that start with the prefix", async () => {
    await writeUserStyles();
    const harness = createHarness();
    await harness.start();

    expect(await harness.completions("")).toEqual([
      { value: "default", label: "default", description: "Pi's standard behavior, with no added style instructions. [bundled]" },
      { value: "brief", label: "brief", description: "Short answers. [user]" },
      { value: "terse", label: "terse", description: "One-line answers. [user]" },
    ]);
    expect((await harness.completions("te"))?.map((item) => item.value)).toEqual(["terse"]);
    expect(await harness.completions("Te")).toEqual([]);
  });

  it("cycles through the full style list and wraps to the first entry", async () => {
    await writeUserStyles();
    const harness = createHarness({ flag: "terse" });
    await harness.start();

    await harness.pressCycleShortcut();
    expect(harness.status()).toBeUndefined();
    expect(await harness.turn()).toBe(CHAINED_PROMPT);

    await harness.pressCycleShortcut();
    expect(harness.status()).toBe(styleStatus("brief"));
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer briefly.`);

    await harness.pressCycleShortcut();
    expect(harness.status()).toBe(styleStatus("terse"));
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer in one line.`);
  });
});
