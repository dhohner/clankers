import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BuildSystemPromptOptions } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMMAND_NAME,
  CYCLE_SHORTCUT,
  FLAG_NAME,
  registerOutputStyles,
  STATUS_KEY,
  STYLES_DIR_NAME,
  type StyleAutocompleteItem,
  type StyleExtensionApi,
  type StyleExtensionContext,
} from "../lib/extension.js";
import { OUTPUT_STYLE_KEY, SETTINGS_FILE_NAME } from "../lib/settings.js";

const CONFIG_DIR_NAME = ".pi";
const CHAINED_PROMPT = "Base prompt.";

// File modes do not deny listing reliably on every OS or for a privileged user, so the listing
// failure is injected instead of provoked through the filesystem, mirroring discovery.test.ts.
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

type Notification = { message: string; level: string };

type FlagRegistration = { name: string; options: { description?: string; type: "boolean" | "string" } };

type CommandRegistration = {
  name: string;
  options: {
    description?: string;
    getArgumentCompletions?: (
      argumentPrefix: string,
    ) => StyleAutocompleteItem[] | null | Promise<StyleAutocompleteItem[] | null>;
    handler: (args: string, ctx: StyleExtensionContext) => Promise<void>;
  };
};

type ShortcutRegistration = {
  shortcut: string;
  options: { description?: string; handler: (ctx: StyleExtensionContext) => Promise<void> | void };
};

type SelectCall = { title: string; options: string[] };

/** A function defers the answer, so a test can hold the selector open across concurrent commands. */
type SelectAnswer = string | undefined | (() => Promise<string | undefined>);

type Harness = {
  start(): Promise<void>;
  turn(systemPrompt?: string): Promise<string>;
  turnResult(options?: BuildSystemPromptOptions): Promise<Record<string, unknown> | undefined>;
  runCommand(args: string): Promise<void>;
  completions(prefix: string): Promise<StyleAutocompleteItem[] | null>;
  pressCycleShortcut(): Promise<void>;
  /** Queues the answer the next ui.select call resolves with; undefined means the user cancels. */
  answerSelect(choice: SelectAnswer): void;
  status(): string | undefined;
  activeTools(): string[];
  notifications: Notification[];
  statusCalls: Array<{ key: string; text: string | undefined }>;
  registeredFlags: FlagRegistration[];
  registeredCommands: CommandRegistration[];
  registeredShortcuts: ShortcutRegistration[];
  selectCalls: SelectCall[];
};

const HARNESS_TOOLS = ["read", "bash", "edit", "write"];

function promptOptions(): BuildSystemPromptOptions {
  return {
    selectedTools: ["read", "bash"],
    toolSnippets: { read: "Read file contents", bash: "Execute shell commands" },
    promptGuidelines: ["Prefer ripgrep over grep"],
    cwd: "/work/project",
    contextFiles: [{ path: "/work/project/AGENTS.md", content: "Always run the linter." }],
    skills: [],
  };
}

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

function styleFile(description: string, instructions: string, mode?: string): string {
  const modeLine = mode === undefined ? "" : `mode: ${mode}\n`;
  return `---\ndescription: ${description}\n${modeLine}---\n${instructions}\n`;
}

function createHarness(options: { flag?: string; trusted?: boolean; hasUI?: boolean } = {}): Harness {
  const notifications: Notification[] = [];
  const handlers: Record<string, (event: never, ctx: StyleExtensionContext) => unknown> = {};

  const selectCalls: SelectCall[] = [];
  const selectAnswers: SelectAnswer[] = [];
  const statuses = new Map<string, string | undefined>();
  const statusCalls: Array<{ key: string; text: string | undefined }> = [];

  const ctx: StyleExtensionContext = {
    hasUI: options.hasUI ?? true,
    cwd,
    isProjectTrusted: () => options.trusted ?? false,
    ui: {
      notify: (message, level) => notifications.push({ message, level: level ?? "info" }),
      select: async (title, selectOptions) => {
        selectCalls.push({ title, options: selectOptions });
        const answer = selectAnswers.shift();
        return typeof answer === "function" ? await answer() : answer;
      },
      setStatus: (key, text) => {
        statusCalls.push({ key, text });
        statuses.set(key, text);
      },
    },
  };

  const registeredFlags: FlagRegistration[] = [];
  const registeredCommands: CommandRegistration[] = [];
  const registeredShortcuts: ShortcutRegistration[] = [];

  // Mirrors Pi's tool API surface so a test can observe whether the extension touches the tool set.
  let activeTools = [...HARNESS_TOOLS];

  const pi = {
    registerFlag: (name: string, flagOptions: FlagRegistration["options"]) => {
      registeredFlags.push({ name, options: flagOptions });
    },
    getActiveTools: () => [...activeTools],
    setActiveTools: (toolNames: string[]) => {
      activeTools = [...toolNames];
    },
    // Mirrors Pi: an unregistered flag reads as undefined, so a value is only visible once registered.
    getFlag: (name: string) =>
      registeredFlags.some((flag) => flag.name === name) && name === FLAG_NAME ? options.flag : undefined,
    registerCommand: (name: string, commandOptions: CommandRegistration["options"]) => {
      registeredCommands.push({ name, options: commandOptions });
    },
    registerShortcut: (shortcut: string, shortcutOptions: ShortcutRegistration["options"]) => {
      registeredShortcuts.push({ shortcut, options: shortcutOptions });
    },
    on: (event: string, handler: (event: never, ctx: StyleExtensionContext) => unknown) => {
      handlers[event] = handler;
    },
  } as unknown as StyleExtensionApi;

  registerOutputStyles(pi, { bundledDir, agentDir, configDirName: CONFIG_DIR_NAME });

  function outputStyleCommand(): CommandRegistration {
    const command = registeredCommands.find((entry) => entry.name === COMMAND_NAME);
    if (!command) throw new Error(`command "${COMMAND_NAME}" is not registered`);
    return command;
  }

  return {
    notifications,
    registeredFlags,
    registeredCommands,
    registeredShortcuts,
    selectCalls,
    statusCalls,
    activeTools: () => [...activeTools],
    async start() {
      await handlers.session_start?.({ type: "session_start" } as never, ctx);
    },
    async runCommand(args) {
      await outputStyleCommand().options.handler(args, ctx);
    },
    async completions(prefix) {
      return (await outputStyleCommand().options.getArgumentCompletions?.(prefix)) ?? null;
    },
    async pressCycleShortcut() {
      const shortcut = registeredShortcuts.find((entry) => entry.shortcut === CYCLE_SHORTCUT);
      if (!shortcut) throw new Error(`shortcut "${CYCLE_SHORTCUT}" is not registered`);
      await shortcut.options.handler(ctx);
    },
    answerSelect(choice) {
      selectAnswers.push(choice);
    },
    status() {
      return statuses.get(STATUS_KEY);
    },
    async turn(systemPrompt = CHAINED_PROMPT) {
      const result = (await handlers.before_agent_start?.(
        { systemPrompt, systemPromptOptions: promptOptions() } as never,
        ctx,
      )) as { systemPrompt?: string } | undefined;
      return result?.systemPrompt ?? systemPrompt;
    },
    async turnResult(options = promptOptions()) {
      return (await handlers.before_agent_start?.(
        { systemPrompt: CHAINED_PROMPT, systemPromptOptions: options } as never,
        ctx,
      )) as Record<string, unknown> | undefined;
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
  listFailures.path = undefined;
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

    expect(harness.status()).toBe("style:default");
  });

  it("switches directly to a named style for the next turn and updates the footer", async () => {
    await writeUserStyles();
    const harness = createHarness();
    await harness.start();
    expect(await harness.turn()).toBe(CHAINED_PROMPT);

    await harness.runCommand("terse");

    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer in one line.`);
    expect(harness.status()).toBe("style:terse");
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
    expect(harness.status()).toBe("style:terse");
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
    expect(harness.status()).toBe("style:brief");
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
    expect(harness.status()).toBe("style:terse");
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
    expect(harness.status()).toBe("style:terse");
  });

  it("keeps the active style when the selector is cancelled", async () => {
    await writeUserStyles();
    const harness = createHarness({ flag: "brief" });
    await harness.start();

    harness.answerSelect(undefined);
    await harness.runCommand("");

    expect(harness.selectCalls).toHaveLength(1);
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer briefly.`);
    expect(harness.status()).toBe("style:brief");
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
    expect(harness.status()).toBe("style:default");
    expect(await harness.turn()).toBe(CHAINED_PROMPT);

    await harness.pressCycleShortcut();
    expect(harness.status()).toBe("style:brief");
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer briefly.`);

    await harness.pressCycleShortcut();
    expect(harness.status()).toBe("style:terse");
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer in one line.`);
  });
});

describe("rescan on /output-style invocation", () => {
  const terse = () => styleFile("One-line answers.", "Answer in one line.");

  it("offers a style file added after session start in the selector", async () => {
    const harness = createHarness();
    await harness.start();

    await writeStyle(join(agentDir, STYLES_DIR_NAME), "terse.md", terse());
    harness.answerSelect(undefined);
    await harness.runCommand("");

    expect(harness.selectCalls[0]?.options).toContain("terse - One-line answers. [user]");
  });

  it("activates a style file added after session start through the named argument", async () => {
    const harness = createHarness();
    await harness.start();

    await writeStyle(join(agentDir, STYLES_DIR_NAME), "terse.md", terse());
    await harness.runCommand("terse");

    expect(harness.status()).toBe("style:terse");
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer in one line.`);
  });

  it("keeps the previous list and reports once when a listable directory becomes unlistable", async () => {
    const userStyles = join(agentDir, STYLES_DIR_NAME);
    await writeStyle(userStyles, "terse.md", terse());
    const harness = createHarness();
    await harness.start();

    listFailures.path = userStyles;
    harness.answerSelect(undefined);
    await harness.runCommand("");

    expect(harness.selectCalls[0]?.options).toContain("terse - One-line answers. [user]");
    expect(harness.notifications).toEqual([
      {
        message: `Output styles keep the previous list: ${userStyles} (cannot list directory: EACCES: permission denied)`,
        level: "warning",
      },
    ]);

    await harness.runCommand("terse");

    expect(harness.status()).toBe("style:terse");
    expect(harness.notifications).toHaveLength(2);
    expect(harness.notifications[1]).toEqual({
      message: 'Output style "terse" is active from the next turn on.',
      level: "info",
    });
  });

  it("adopts a fresh list when a directory was already unlistable at the previous scan", async () => {
    const userStyles = join(agentDir, STYLES_DIR_NAME);
    listFailures.path = userStyles;
    const harness = createHarness({ trusted: true });
    await harness.start();

    await writeStyle(join(cwd, CONFIG_DIR_NAME, STYLES_DIR_NAME), "local.md", styleFile("Project style.", "Project text."));
    await harness.runCommand("local");

    expect(harness.status()).toBe("style:local");
    expect(harness.notifications).toEqual([
      {
        message: `Output style skipped: ${userStyles} (cannot list directory: EACCES: permission denied)`,
        level: "warning",
      },
      { message: 'Output style "local" is active from the next turn on.', level: "info" },
    ]);
  });

  it("reports a malformed style file once across the session-start scan and all rescans", async () => {
    const userStyles = join(agentDir, STYLES_DIR_NAME);
    await writeStyle(userStyles, "terse.md", terse());
    const malformed = await writeStyle(userStyles, "broken.md", "no frontmatter here\n");
    const harness = createHarness();
    await harness.start();

    harness.answerSelect(undefined);
    await harness.runCommand("");
    harness.answerSelect(undefined);
    await harness.runCommand("");

    expect(harness.notifications).toEqual([
      { message: `Output style skipped: ${malformed} (no readable YAML frontmatter block)`, level: "warning" },
    ]);
  });

  it("reports a new reason for an already-reported path once", async () => {
    const userStyles = join(agentDir, STYLES_DIR_NAME);
    const path = await writeStyle(userStyles, "broken.md", "no frontmatter here\n");
    const harness = createHarness();
    await harness.start();

    await writeStyle(userStyles, "broken.md", "---\ndescription: Empty body.\n---\n\n");
    harness.answerSelect(undefined);
    await harness.runCommand("");
    harness.answerSelect(undefined);
    await harness.runCommand("");

    expect(harness.notifications).toEqual([
      { message: `Output style skipped: ${path} (no readable YAML frontmatter block)`, level: "warning" },
      { message: `Output style skipped: ${path} (style instruction text is empty)`, level: "warning" },
    ]);
  });

  it("cycles through the list as it was at the last scan without a rescan", async () => {
    await writeStyle(join(agentDir, STYLES_DIR_NAME), "brief.md", styleFile("Short answers.", "Answer briefly."));
    const harness = createHarness();
    await harness.start();

    await writeStyle(join(agentDir, STYLES_DIR_NAME), "terse.md", terse());
    await harness.pressCycleShortcut();
    expect(harness.status()).toBe("style:brief");
    await harness.pressCycleShortcut();
    expect(harness.status()).toBe("style:default");
  });

  it("keeps the in-memory list for argument autocompletion", async () => {
    const harness = createHarness();
    await harness.start();

    await writeStyle(join(agentDir, STYLES_DIR_NAME), "terse.md", terse());

    expect((await harness.completions(""))?.map((item) => item.value)).toEqual(["default"]);
  });

  it("activates the selected style when a concurrent invocation reorders the list mid-dialog", async () => {
    const userStyles = join(agentDir, STYLES_DIR_NAME);
    await writeStyle(userStyles, "brief.md", styleFile("Short answers.", "Answer briefly."));
    await writeStyle(userStyles, "terse.md", terse());
    const harness = createHarness();
    await harness.start();

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

    // "alpha" sorts before "terse", so the concurrent rescan shifts terse's list position.
    await writeStyle(userStyles, "alpha.md", styleFile("Alpha.", "Alpha text."));
    await harness.runCommand("alpha");
    releaseSelect();
    await selecting;

    expect(harness.status()).toBe("style:terse");
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer in one line.`);
  });

  it("cycles onward from the active style after a rescan replaced the list objects", async () => {
    const userStyles = join(agentDir, STYLES_DIR_NAME);
    await writeStyle(userStyles, "brief.md", styleFile("Short answers.", "Answer briefly."));
    await writeStyle(userStyles, "terse.md", terse());
    const harness = createHarness({ flag: "brief" });
    await harness.start();

    harness.answerSelect(undefined);
    await harness.runCommand("");
    await harness.pressCycleShortcut();

    expect(harness.status()).toBe("style:terse");
  });

  it("cycles to the first entry when a rescan removed the active style", async () => {
    const path = await writeStyle(join(agentDir, STYLES_DIR_NAME), "brief.md", styleFile("Short answers.", "Answer briefly."));
    const harness = createHarness({ flag: "brief" });
    await harness.start();

    await rm(path);
    harness.answerSelect(undefined);
    await harness.runCommand("");
    await harness.pressCycleShortcut();

    expect(harness.status()).toBe("style:default");
  });
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
    expect(harness.status()).toBe("style:terse");
    expect(harness.notifications).toEqual([]);
  });

  it("falls back to default when the active style's file is deleted, without a settings write", async () => {
    const stylePath = await writeStyle(join(agentDir, STYLES_DIR_NAME), "terse.md", terse());
    const settings = await persistProjectStyle("terse");
    const harness = createHarness({ trusted: true });
    await harness.start();
    expect(harness.status()).toBe("style:terse");

    await rm(stylePath);
    harness.answerSelect(undefined);
    await harness.runCommand("");

    expect(harness.status()).toBe("style:default");
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

    expect(harness.status()).toBe("style:default");
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

    expect(harness.status()).toBe("style:default");
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

    expect(harness.status()).toBe("style:brief");
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
    expect(harness.status()).toBe("style:terse");

    listFailures.path = userStyles;
    harness.answerSelect(undefined);
    await harness.runCommand("");

    expect(harness.status()).toBe("style:terse");
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

    expect(harness.status()).toBe("style:default");
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

    expect(harness.status()).toBe("style:terse");
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nUser terse text.`);
    expect(harness.notifications).toEqual([]);
  });
});

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

    expect(secondSession.status()).toBe("style:terse");
    expect(await secondSession.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer in one line.`);
    expect(secondSession.notifications).toEqual([]);
  });

  it("prefers the persisted project value over the persisted global value", async () => {
    await writeUserStyles();
    await writeSettings(projectSettingsPath(), { [OUTPUT_STYLE_KEY]: "terse" });
    await writeSettings(globalSettingsPath(), { [OUTPUT_STYLE_KEY]: "brief" });

    const harness = createHarness({ trusted: true });
    await harness.start();

    expect(harness.status()).toBe("style:terse");
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer in one line.`);
  });

  it("ignores the project settings file in an untrusted project", async () => {
    await writeUserStyles();
    await writeSettings(projectSettingsPath(), { [OUTPUT_STYLE_KEY]: "terse" });
    await writeSettings(globalSettingsPath(), { [OUTPUT_STYLE_KEY]: "brief" });

    const harness = createHarness({ trusted: false });
    await harness.start();

    expect(harness.status()).toBe("style:brief");
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer briefly.`);
    expect(harness.notifications).toEqual([]);
  });

  it("lets the flag win over a persisted value without changing the file", async () => {
    await writeUserStyles();
    await writeSettings(projectSettingsPath(), { [OUTPUT_STYLE_KEY]: "terse" });

    const harness = createHarness({ flag: "brief", trusted: true });
    await harness.start();

    expect(harness.status()).toBe("style:brief");
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

    expect(harness.status()).toBe("style:terse");
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

    expect(harness.status()).toBe("style:default");
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

    expect(harness.status()).toBe("style:terse");
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

    expect(harness.status()).toBe("style:brief");
    expect(await readSettings(projectSettingsPath())).toEqual({ [OUTPUT_STYLE_KEY]: "brief" });
  });
});

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
