import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FLAG_NAME,
  registerOutputStyles,
  STYLES_DIR_NAME,
  type StyleExtensionApi,
  type StyleExtensionContext,
} from "../lib/extension.js";

const CONFIG_DIR_NAME = ".pi";
const CHAINED_PROMPT = "Base prompt.";

type Notification = { message: string; level: string };

type FlagRegistration = { name: string; options: { description?: string; type: "boolean" | "string" } };

type Harness = {
  start(): Promise<void>;
  turn(systemPrompt?: string): Promise<string>;
  notifications: Notification[];
  registeredFlags: FlagRegistration[];
};

let root: string;
let bundledDir: string;
let agentDir: string;
let cwd: string;

async function writeStyle(directory: string, file: string, content: string): Promise<string> {
  await mkdir(directory, { recursive: true });
  const path = join(directory, file);
  await writeFile(path, content, "utf8");
  return path;
}

function styleFile(description: string, instructions: string): string {
  return `---\ndescription: ${description}\n---\n${instructions}\n`;
}

function createHarness(options: { flag?: string; trusted?: boolean } = {}): Harness {
  const notifications: Notification[] = [];
  const handlers: Record<string, (event: never, ctx: StyleExtensionContext) => unknown> = {};

  const ctx: StyleExtensionContext = {
    hasUI: true,
    cwd,
    isProjectTrusted: () => options.trusted ?? false,
    ui: { notify: (message, level) => notifications.push({ message, level: level ?? "info" }) },
  };

  const registeredFlags: FlagRegistration[] = [];

  const pi = {
    registerFlag: (name: string, flagOptions: FlagRegistration["options"]) => {
      registeredFlags.push({ name, options: flagOptions });
    },
    // Mirrors Pi: an unregistered flag reads as undefined, so a value is only visible once registered.
    getFlag: (name: string) =>
      registeredFlags.some((flag) => flag.name === name) && name === FLAG_NAME ? options.flag : undefined,
    on: (event: string, handler: (event: never, ctx: StyleExtensionContext) => unknown) => {
      handlers[event] = handler;
    },
  } as unknown as StyleExtensionApi;

  registerOutputStyles(pi, { bundledDir, agentDir, configDirName: CONFIG_DIR_NAME });

  return {
    notifications,
    registeredFlags,
    async start() {
      await handlers.session_start?.({ type: "session_start" } as never, ctx);
    },
    async turn(systemPrompt = CHAINED_PROMPT) {
      const result = (await handlers.before_agent_start?.({ systemPrompt } as never, ctx)) as
        | { systemPrompt?: string }
        | undefined;
      return result?.systemPrompt ?? systemPrompt;
    },
  };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "output-styles-extension-"));
  bundledDir = join(root, "bundled");
  agentDir = join(root, "agent");
  cwd = join(root, "project");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

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

  it("keeps the chained prompt when no style directory exists", async () => {
    const harness = createHarness();
    await harness.start();

    expect(await harness.turn("Prompt from another extension.")).toBe("Prompt from another extension.");
    expect(harness.notifications).toEqual([]);
  });
});
