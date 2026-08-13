import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BuildSystemPromptOptions } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach } from "vitest";
import {
  COMMAND_NAME,
  CYCLE_SHORTCUT,
  FLAG_NAME,
  registerOutputStyles,
  STATUS_KEY,
  type StyleAutocompleteItem,
  type StyleExtensionApi,
  type StyleExtensionContext,
} from "../../lib/extension.js";
import { STATUS_LABEL } from "../../lib/status.js";

export const CONFIG_DIR_NAME = ".pi";

// Mirrors the harness theme, whose fg() tags the text instead of emitting ANSI codes, so an
// assertion states both the text and the color role of every part.
export const styleStatus = (name: string) => `[dim:${STATUS_LABEL}] [accent:${name}]`;

export const CHAINED_PROMPT = "Base prompt.";

export const HARNESS_TOOLS = ["read", "bash", "edit", "write"];

export type Notification = { message: string; level: string };

export type FlagRegistration = { name: string; options: { description?: string; type: "boolean" | "string" } };

export type CommandRegistration = {
  name: string;
  options: {
    description?: string;
    getArgumentCompletions?: (
      argumentPrefix: string,
    ) => StyleAutocompleteItem[] | null | Promise<StyleAutocompleteItem[] | null>;
    handler: (args: string, ctx: StyleExtensionContext) => Promise<void>;
  };
};

export type ShortcutRegistration = {
  shortcut: string;
  options: { description?: string; handler: (ctx: StyleExtensionContext) => Promise<void> | void };
};

export type SelectCall = { title: string; options: string[] };

export type InputCall = { title: string; placeholder?: string };

export type EditorCall = { title: string; prefill?: string };

/** A function defers the answer, so a test can hold the selector open across concurrent commands. */
export type SelectAnswer = string | undefined | (() => Promise<string | undefined>);

/** A function defers the answer, so a test can change the disk while the editor is open. */
export type EditorAnswer = string | undefined | (() => Promise<string | undefined>);

export type Harness = {
  start(): Promise<void>;
  turn(systemPrompt?: string): Promise<string>;
  turnResult(options?: BuildSystemPromptOptions): Promise<Record<string, unknown> | undefined>;
  runCommand(args: string): Promise<void>;
  completions(prefix: string): Promise<StyleAutocompleteItem[] | null>;
  pressCycleShortcut(): Promise<void>;
  /** Queues the answer the next ui.select call resolves with; undefined means the user cancels. */
  answerSelect(choice: SelectAnswer): void;
  /** Queues the answer the next ui.input call resolves with; undefined means the user cancels. */
  answerInput(text: string | undefined): void;
  /** Queues the answer the next ui.editor call resolves with; undefined means the user cancels. */
  answerEditor(text: EditorAnswer): void;
  status(): string | undefined;
  activeTools(): string[];
  notifications: Notification[];
  statusCalls: Array<{ key: string; text: string | undefined }>;
  registeredFlags: FlagRegistration[];
  registeredCommands: CommandRegistration[];
  registeredShortcuts: ShortcutRegistration[];
  selectCalls: SelectCall[];
  inputCalls: InputCall[];
  editorCalls: EditorCall[];
};

// The hooks below rebuild these per test, and an ES live binding carries the new value into every
// importing test file, so a test reads them as plain names.
export let root = "";
export let bundledDir = "";
export let agentDir = "";
export let cwd = "";

export function promptOptions(): BuildSystemPromptOptions {
  return {
    selectedTools: ["read", "bash"],
    toolSnippets: { read: "Read file contents", bash: "Execute shell commands" },
    promptGuidelines: ["Prefer ripgrep over grep"],
    cwd: "/work/project",
    contextFiles: [{ path: "/work/project/AGENTS.md", content: "Always run the linter." }],
    skills: [],
  };
}

export async function writeStyle(directory: string, file: string, content: string): Promise<string> {
  await mkdir(directory, { recursive: true });
  const path = join(directory, file);
  await writeFile(path, content, "utf8");
  return path;
}

export function styleFile(description: string, instructions: string, mode?: string): string {
  const modeLine = mode === undefined ? "" : `mode: ${mode}\n`;
  return `---\ndescription: ${description}\n${modeLine}---\n${instructions}\n`;
}

export function createHarness(options: { flag?: string; trusted?: boolean; hasUI?: boolean } = {}): Harness {
  const notifications: Notification[] = [];
  const handlers: Record<string, (event: never, ctx: StyleExtensionContext) => unknown> = {};

  const selectCalls: SelectCall[] = [];
  const selectAnswers: SelectAnswer[] = [];
  const inputCalls: InputCall[] = [];
  const inputAnswers: Array<string | undefined> = [];
  const editorCalls: EditorCall[] = [];
  const editorAnswers: EditorAnswer[] = [];
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
      input: async (title, placeholder) => {
        inputCalls.push({ title, placeholder });
        return inputAnswers.shift();
      },
      editor: async (title, prefill) => {
        editorCalls.push({ title, prefill });
        const answer = editorAnswers.shift();
        return typeof answer === "function" ? await answer() : answer;
      },
      theme: { fg: (color, text) => `[${color}:${text}]` },
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
    inputCalls,
    editorCalls,
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
    answerInput(text) {
      inputAnswers.push(text);
    },
    answerEditor(text) {
      editorAnswers.push(text);
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

// Importing this module registers the hooks, so every importing file gets a fresh temporary root per
// test and no file depends on state another file leaves behind. The vitest configuration shuffles
// both the file order and the test order, which makes that isolation a requirement.
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "output-styles-extension-"));
  bundledDir = join(root, "bundled");
  agentDir = join(root, "agent");
  cwd = join(root, "project");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
