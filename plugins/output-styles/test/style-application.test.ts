import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FLAG_NAME, STYLES_DIR_NAME } from "../lib/extension.js";
import {
  agentDir,
  CHAINED_PROMPT,
  CONFIG_DIR_NAME,
  createHarness,
  cwd,
  HARNESS_TOOLS,
  promptOptions,
  styleFile,
  writeStyle,
} from "./support/extension-harness.js";

describe("output styles extension", () => {
  it("registers the string flag Pi parses the value with", () => {
    const harness = createHarness();

    expect(harness.registeredFlags).toEqual([
      {
        name: FLAG_NAME,
        options: {
          description: "Response style to apply to the agent system prompt for this session",
          type: "string",
        },
      },
    ]);
  });

  it("appends a flag-selected user style to the chained prompt", async () => {
    await writeStyle(join(agentDir, STYLES_DIR_NAME), "terse.md", styleFile("Answer briefly.", "Answer in one line."));

    const harness = createHarness({ flag: "terse" });
    await harness.start();

    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer in one line.`);
    expect(harness.notifications).toEqual([]);
  });

  it("leaves the chained prompt untouched without a flag", async () => {
    await writeStyle(join(agentDir, STYLES_DIR_NAME), "terse.md", styleFile("Answer briefly.", "Answer in one line."));

    const harness = createHarness();
    await harness.start();

    expect(await harness.turn()).toBe(CHAINED_PROMPT);
  });

  it.each([
    ["without a flag", undefined],
    ["with an explicit default flag", "default"],
    ["for an unknown flag value", "missing"],
  ])("keeps the chained prompt unchanged %s when a project file claims the default name", async (_case, flag) => {
    const path = await writeStyle(
      join(cwd, CONFIG_DIR_NAME, STYLES_DIR_NAME),
      "default.md",
      styleFile("Project default.", "Project default text."),
    );

    const harness = createHarness({ flag, trusted: true });
    await harness.start();

    expect(await harness.turn()).toBe(CHAINED_PROMPT);
    expect(harness.notifications[0]).toEqual({
      message: `Output style skipped: ${path} (style name "default" is reserved for the built-in style)`,
      level: "warning",
    });
  });

  it("uses a project style over a user style in a trusted project", async () => {
    await writeStyle(join(agentDir, STYLES_DIR_NAME), "terse.md", styleFile("User.", "User text."));
    await writeStyle(join(cwd, CONFIG_DIR_NAME, STYLES_DIR_NAME), "terse.md", styleFile("Project.", "Project text."));

    const harness = createHarness({ flag: "terse", trusted: true });
    await harness.start();

    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nProject text.`);
  });

  it("ignores project styles in an untrusted project", async () => {
    await writeStyle(join(cwd, CONFIG_DIR_NAME, STYLES_DIR_NAME), "local.md", styleFile("Project.", "Project text."));

    const harness = createHarness({ flag: "local" });
    await harness.start();

    expect(await harness.turn()).toBe(CHAINED_PROMPT);
    expect(harness.notifications).toHaveLength(1);
    expect(harness.notifications[0]?.message).toContain('Unknown output style "local"');
  });

  it("falls back to the default style and reports an unknown flag value once", async () => {
    await writeStyle(join(agentDir, STYLES_DIR_NAME), "terse.md", styleFile("Answer briefly.", "Answer in one line."));

    const harness = createHarness({ flag: "missing" });
    await harness.start();
    await harness.turn();
    await harness.turn();

    expect(await harness.turn()).toBe(CHAINED_PROMPT);
    expect(harness.notifications).toHaveLength(1);
    expect(harness.notifications[0]).toEqual({
      message: 'Unknown output style "missing". Using "default". Available: default, terse',
      level: "warning",
    });
  });

  it.each([
    ["an empty flag value", ""],
    ["a blank flag value", "  "],
  ])("reports %s as unknown and keeps the default style", async (_case, flag) => {
    await writeStyle(join(agentDir, STYLES_DIR_NAME), "terse.md", styleFile("Answer briefly.", "Answer in one line."));

    const harness = createHarness({ flag });
    await harness.start();

    expect(await harness.turn()).toBe(CHAINED_PROMPT);
    expect(harness.notifications).toHaveLength(1);
    expect(harness.notifications[0]).toEqual({
      message: `Unknown output style "${flag}". Using "default". Available: default, terse`,
      level: "warning",
    });
  });

  it("reports a malformed style file once per session and keeps the valid styles usable", async () => {
    const userStyles = join(agentDir, STYLES_DIR_NAME);
    await writeStyle(userStyles, "terse.md", styleFile("Answer briefly.", "Answer in one line."));
    const malformed = await writeStyle(userStyles, "broken.md", "no frontmatter here\n");

    const harness = createHarness({ flag: "terse" });
    await harness.start();
    await harness.turn();

    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer in one line.`);
    expect(harness.notifications).toHaveLength(1);
    expect(harness.notifications[0]?.message).toBe(
      `Output style skipped: ${malformed} (no readable YAML frontmatter block)`,
    );
  });

  it("rebuilds the prompt for a replace-mode style and keeps the capability material", async () => {
    await writeStyle(
      join(agentDir, STYLES_DIR_NAME),
      "pirate.md",
      styleFile("Talk like a pirate.", "Answer like a pirate.", "replace"),
    );

    const harness = createHarness({ flag: "pirate" });
    await harness.start();
    const prompt = await harness.turn();

    expect(prompt).toContain("Answer like a pirate.");
    expect(prompt).not.toContain(CHAINED_PROMPT);
    expect(prompt).toContain("- read: Read file contents");
    expect(prompt).toContain("- bash: Execute shell commands");
    expect(prompt).toContain("- Prefer ripgrep over grep");
    expect(prompt).toContain('<project_instructions path="/work/project/AGENTS.md">');
    expect(prompt).toContain("Current working directory: /work/project");
  });

  it("changes only the system prompt and leaves the active tool set untouched in replace mode", async () => {
    await writeStyle(
      join(agentDir, STYLES_DIR_NAME),
      "pirate.md",
      styleFile("Talk like a pirate.", "Answer like a pirate.", "replace"),
    );

    const harness = createHarness({ flag: "pirate" });
    await harness.start();
    expect(harness.activeTools()).toEqual(HARNESS_TOOLS);

    const options = promptOptions();
    const result = await harness.turnResult(options);

    expect(Object.keys(result ?? {})).toEqual(["systemPrompt"]);
    expect(options).toEqual(promptOptions());
    expect(harness.activeTools()).toEqual(HARNESS_TOOLS);
  });

  it("skips a replace-mode style file with an empty body like an append-mode one", async () => {
    const path = await writeStyle(
      join(agentDir, STYLES_DIR_NAME),
      "empty.md",
      styleFile("Empty body.", "", "replace"),
    );

    const harness = createHarness({ flag: "empty" });
    await harness.start();

    expect(await harness.turn()).toBe(CHAINED_PROMPT);
    expect(harness.notifications[0]?.message).toBe(`Output style skipped: ${path} (style instruction text is empty)`);
  });

  it("keeps the chained prompt when no style directory exists", async () => {
    const harness = createHarness();
    await harness.start();

    expect(await harness.turn("Prompt from another extension.")).toBe("Prompt from another extension.");
    expect(harness.notifications).toEqual([]);
  });
});
