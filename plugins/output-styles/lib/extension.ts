import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BuildSystemPromptOptions, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { serializeStyleFile, styleNameProblem } from "./create-style.ts";
import { describeError, discoverStyles } from "./discovery.ts";
import { applyStyle } from "./prompt.ts";
import { formatStatusText, type StatusTheme } from "./status.ts";
import {
  readPersistedStyleName,
  resolveStartupStyle,
  SETTINGS_FILE_NAME,
  type StartupOrigin,
  writePersistedStyleName,
} from "./settings.ts";
import { STYLE_FILE_SUFFIX } from "./style-file.ts";
import { DEFAULT_STYLE, NEW_STYLE_NAME, type StyleDefinition, type StyleProblem } from "./types.ts";

export const FLAG_NAME = "output-style";

export const COMMAND_NAME = "output-style";

export const CYCLE_SHORTCUT = "ctrl+shift+y";

/** Footer status key. One key per extension, so a new text replaces the previous one. */
export const STATUS_KEY = "output-style";

/** Directory name holding style files inside the agent directory and inside the project config directory. */
export const STYLES_DIR_NAME = "output-styles";

type NotifyLevel = "info" | "warning" | "error";

export type StyleAutocompleteItem = {
  value: string;
  label: string;
  description?: string;
};

// Deliberate structural subsets of Pi's own API and handler context: the extension only needs these
// members, and tests can build them directly. The assertions below stop the subsets from drifting away
// from Pi, which would otherwise compile cleanly and fail only at runtime.
export type StyleExtensionContext = {
  hasUI: boolean;
  cwd: string;
  isProjectTrusted(): boolean;
  ui: {
    notify(message: string, type?: NotifyLevel): void;
    select(title: string, options: string[]): Promise<string | undefined>;
    input(title: string, placeholder?: string): Promise<string | undefined>;
    editor(title: string, prefill?: string): Promise<string | undefined>;
    setStatus(key: string, text: string | undefined): void;
    readonly theme: StatusTheme;
  };
};

export type StyleExtensionApi = {
  registerFlag(name: string, options: { description?: string; type: "boolean" | "string" }): void;
  getFlag(name: string): boolean | string | undefined;
  registerCommand(
    name: string,
    options: {
      description?: string;
      getArgumentCompletions?: (
        argumentPrefix: string,
      ) => StyleAutocompleteItem[] | null | Promise<StyleAutocompleteItem[] | null>;
      handler: (args: string, ctx: StyleExtensionContext) => Promise<void>;
    },
  ): void;
  registerShortcut(
    shortcut: string,
    options: { description?: string; handler: (ctx: StyleExtensionContext) => Promise<void> | void },
  ): void;
  on(
    event: "session_start",
    handler: (event: { type: "session_start" }, ctx: StyleExtensionContext) => Promise<void> | void,
  ): void;
  on(
    event: "before_agent_start",
    handler: (
      event: { systemPrompt: string; systemPromptOptions: BuildSystemPromptOptions },
      ctx: StyleExtensionContext,
    ) => Promise<{ systemPrompt?: string } | undefined>,
  ): void;
};

/** Errors if `Source` is not assignable to `Target`, unlike a boolean check that `never` satisfies. */
type AssertAssignable<Source extends Target, Target> = Source;

type _PiApiIsCompatible = AssertAssignable<ExtensionAPI, StyleExtensionApi>;
type _PiContextIsCompatible = AssertAssignable<ExtensionContext, StyleExtensionContext>;

export type StyleExtensionOptions = {
  /** Directory of the styles shipped with this plugin. */
  bundledDir: string;
  /** Pi's global agent directory, the parent of the user style directory. */
  agentDir: string;
  /** Pi's project config directory name, the parent of the project style directory inside the project. */
  configDirName: string;
};

export function registerOutputStyles(pi: StyleExtensionApi, options: StyleExtensionOptions): void {
  let styles: StyleDefinition[] = [DEFAULT_STYLE];
  let activeStyle: StyleDefinition = DEFAULT_STYLE;
  /** Directories the most recent adopted scan failed to list, the baseline a rescan compares to. */
  let unlistableDirs = new Set<string>();
  /** Problem pairs of path and reason already reported, so every scan of a session reports a pair once. */
  const reportedProblems = new Set<string>();

  pi.registerFlag(FLAG_NAME, {
    description: "Response style to apply to the agent system prompt for this session",
    type: "string",
  });

  function notify(ctx: StyleExtensionContext, message: string, level: NotifyLevel): void {
    if (ctx.hasUI) {
      ctx.ui.notify(message, level);
      return;
    }
    // Print and JSON mode carry the agent answer on standard output, so without a user interface
    // every message goes to standard error: nothing is dropped and the parsed answer stream stays
    // clean.
    process.stderr.write(`output-styles: ${message}\n`);
  }

  function showFooterStatus(ctx: StyleExtensionContext): void {
    if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, formatStatusText(activeStyle, ctx.ui.theme));
  }

  function styleDirectories(ctx: StyleExtensionContext): Parameters<typeof discoverStyles>[0] {
    return {
      bundledDir: options.bundledDir,
      userDir: join(options.agentDir, STYLES_DIR_NAME),
      projectDir: ctx.isProjectTrusted() ? join(ctx.cwd, options.configDirName, STYLES_DIR_NAME) : undefined,
    };
  }

  // NUL cannot occur in a path, so the joined key cannot collide across different pairs.
  function problemKey(problem: StyleProblem): string {
    return `${problem.path}\u0000${problem.reason}`;
  }

  function reportProblemOnce(ctx: StyleExtensionContext, problem: StyleProblem): void {
    const key = problemKey(problem);
    if (reportedProblems.has(key)) return;
    reportedProblems.add(key);
    notify(ctx, `Output style skipped: ${problem.path} (${problem.reason})`, "warning");
  }

  /**
   * A kept list is a state of the running session, not a one-off event, so every invocation that
   * keeps the previous list reports it again. A user who adds a style file to a healthy directory
   * would otherwise see nothing at all and could not tell a working plugin from a stuck one. The
   * set lives for one invocation only, so an invocation that scans twice, the create flow for
   * example, still reports one warning per affected directory. The key is the directory alone, not
   * the pair with the reason, so a directory whose failure reason changes between the two scans is
   * still reported once.
   */
  function reportKeptList(ctx: StyleExtensionContext, problem: StyleProblem, reportedThisInvocation: Set<string>): void {
    if (reportedThisInvocation.has(problem.path)) return;
    reportedThisInvocation.add(problem.path);
    notify(ctx, `Output styles keep the previous list: ${problem.path} (${problem.reason})`, "warning");
  }

  /**
   * Serializes the command-handler scans: Pi runs command handlers unserialized, and chaining the
   * scans keeps two concurrent invocations from interleaving their scan and adoption steps, so the
   * scan adopted last is also the scan started last. Scans never reject, so the chain cannot stall.
   */
  let scanChain: Promise<unknown> = Promise.resolve();

  /**
   * Returns whether this scan's fresh list was adopted, so a caller can act on adoption only.
   * `reportedKeptLists` is the invocation-wide set of kept-list reports the command handler owns.
   */
  function rescanStyles(ctx: StyleExtensionContext, reportedKeptLists: Set<string>): Promise<boolean> {
    const run = scanChain.then(async () => {
      // Re-resolution is defined against a freshly adopted list only. A scan that kept the
      // previous list proves nothing new about the files, so acting on it could drop a style the
      // disk still defines, for example one activated from a selector snapshot.
      const adopted = await scanAndAdoptStyles(ctx, reportedKeptLists);
      if (adopted) reresolveActiveStyle(ctx);
      return adopted;
    });
    scanChain = run;
    return run;
  }

  /**
   * Follows the active style's file after an adopted rescan: the active name is looked up in the
   * fresh list, so an edited definition takes effect silently and a name the list no longer holds
   * falls back to the built-in default with one report. The lookup is by name, not path, matching
   * the precedence rule that only the winning definition for a name is selectable, so a deleted
   * file hands the name over to a surviving same-name definition from another source. The
   * fallback is in-memory only and never writes the settings file, so a temporarily broken
   * persisted style is not lost across sessions. Repeated invocations after a fallback stay
   * quiet, because the default name always resolves.
   */
  function reresolveActiveStyle(ctx: StyleExtensionContext): void {
    const resolved = styles.find((style) => style.name === activeStyle.name);
    if (resolved) {
      activeStyle = resolved;
      return;
    }
    const lostName = activeStyle.name;
    activeStyle = DEFAULT_STYLE;
    showFooterStatus(ctx);
    notify(
      ctx,
      `Output style "${lostName}" is no longer available. The built-in "${DEFAULT_STYLE.name}" style is now active.`,
      "warning",
    );
  }

  /**
   * Refreshes the style list from disk so the command acts on the current files. When the scan
   * cannot list a directory the most recent adopted scan listed successfully, the fresh list would
   * silently drop that directory's styles, so the previous list stays in use; a directory that was
   * already unlistable does not block adoption. Returns whether the fresh list was adopted.
   */
  async function scanAndAdoptStyles(ctx: StyleExtensionContext, reportedKeptLists: Set<string>): Promise<boolean> {
    try {
      const discovery = await discoverStyles(styleDirectories(ctx));
      const regressed = new Set(discovery.unlistableDirectories.filter((dir) => !unlistableDirs.has(dir)));
      for (const problem of discovery.problems) {
        if (regressed.has(problem.path)) reportKeptList(ctx, problem, reportedKeptLists);
        else reportProblemOnce(ctx, problem);
      }
      if (regressed.size > 0) return false;
      styles = discovery.styles;
      unlistableDirs = new Set(discovery.unlistableDirectories);
      return true;
    } catch (error) {
      notify(ctx, `Output styles keep the previous list: ${describeError(error)}`, "warning");
      return false;
    }
  }

  /** Trust decides the write target: the project settings file only for a trusted project. */
  function settingsPathFor(ctx: StyleExtensionContext): string {
    return ctx.isProjectTrusted()
      ? join(ctx.cwd, options.configDirName, SETTINGS_FILE_NAME)
      : join(options.agentDir, SETTINGS_FILE_NAME);
  }

  /**
   * The one switch path shared by the flag-less selector, the named command argument, and the cycle
   * shortcut, so every surface produces the same footer update, the same effect on the next turn,
   * and the same persisted selection. Switching to the already active style is allowed and rewrites
   * the same value. A failed write keeps the switch active and is reported, never thrown.
   */
  async function activateStyle(style: StyleDefinition, ctx: StyleExtensionContext): Promise<void> {
    activeStyle = style;
    showFooterStatus(ctx);
    notify(ctx, `Output style "${style.name}" is active from the next turn on.`, "info");
    try {
      await writePersistedStyleName(settingsPathFor(ctx), style.name);
    } catch (error) {
      notify(
        ctx,
        `Output style "${style.name}" stays active for this session but could not be persisted: ${describeError(error)}`,
        "warning",
      );
    }
  }

  function unknownStartupStyleMessage(origin: StartupOrigin, name: string, resolved: StyleDefinition): string {
    const from = origin === "flag" ? "" : ` persisted in ${origin} settings`;
    return `Unknown output style "${name}"${from}. Using "${resolved.name}". Available: ${styles
      .map((style) => style.name)
      .join(", ")}`;
  }

  function reportUnknownStyle(ctx: StyleExtensionContext, requested: string): void {
    notify(
      ctx,
      `Unknown output style "${requested}". The active style stays "${activeStyle.name}". Available: ${styles
        .map((style) => style.name)
        .join(", ")}`,
      "warning",
    );
  }

  function selectorLabel(style: StyleDefinition): string {
    const activeMark = style.name === activeStyle.name ? " (active)" : "";
    return `${style.name}${activeMark} - ${style.description} [${style.source}]`;
  }

  /** The argument-less command without a user interface: name what a follow-up call can switch to. */
  function reportStyleNames(ctx: StyleExtensionContext): void {
    notify(
      ctx,
      `Available output styles: ${styles.map((style) => style.name).join(", ")}. The active style is "${activeStyle.name}". Switch with "/output-style <name>".`,
      "info",
    );
  }

  async function openStyleSelector(ctx: StyleExtensionContext): Promise<void> {
    // The label list mirrors this snapshot index by index, so the chosen label maps back by
    // position even when a concurrent command replaces the global list while the dialog is open:
    // the user gets the style the dialog showed, not whatever later landed on that position.
    const offered = styles;
    const labels = offered.map(selectorLabel);
    const choice = await ctx.ui.select("Select output style", labels);
    // Cancelling resolves to undefined and leaves the active style unchanged.
    if (choice === undefined) return;
    const selected = offered[labels.indexOf(choice)];
    if (selected) await activateStyle(selected, ctx);
  }

  /**
   * The create-flow dialogs share cancel and refusal semantics: a cancel resolves to undefined,
   * ends the flow silently like a cancelled selector, and changes nothing; a refused value is
   * reported with its reason and the same dialog opens again, so a typo does not restart the flow.
   */
  async function collectStyleName(ctx: StyleExtensionContext): Promise<string | undefined> {
    for (;;) {
      const name = await ctx.ui.input("Name of the new style", "letters, digits, dash, underscore");
      if (name === undefined) return undefined;
      const problem = styleNameProblem(name);
      if (problem === undefined) return name;
      notify(ctx, `Style name refused: ${problem}.`, "warning");
    }
  }

  /**
   * The parser strips outer whitespace on every read, so only a value without it parses back to
   * exactly what was entered; anything else is refused instead of silently changed, keeping the
   * round-trip contract exact for every accepted value.
   */
  async function collectStyleDescription(ctx: StyleExtensionContext): Promise<string | undefined> {
    for (;;) {
      const description = await ctx.ui.input("Description of the new style", "shown in the style selector");
      if (description === undefined) return undefined;
      if (description.trim() === "") {
        notify(ctx, "Style description refused: the description is empty.", "warning");
        continue;
      }
      if (description !== description.trim()) {
        notify(
          ctx,
          "Style description refused: remove the leading and trailing whitespace, which does not survive a reread of the file.",
          "warning",
        );
        continue;
      }
      return description;
    }
  }

  /**
   * The editor result arrives exactly as Pi returned it: Pi already strips the terminating
   * newline of its external editor, so a trailing newline in the result is entered content, not
   * an editor artifact, and stripping it here would silently change the value. All outer
   * whitespace is refused under the same round-trip rule as the description, and the editor
   * re-opens prefilled with the trimmed text, so one confirmation fixes the input.
   */
  async function collectStyleInstructions(ctx: StyleExtensionContext): Promise<string | undefined> {
    let prefill: string | undefined;
    for (;;) {
      const instructions = await ctx.ui.editor("Instruction text of the new style", prefill);
      if (instructions === undefined) return undefined;
      if (instructions.trim() === "") {
        notify(ctx, "Style instructions refused: the instruction text is empty.", "warning");
        prefill = undefined;
        continue;
      }
      if (instructions !== instructions.trim()) {
        notify(
          ctx,
          "Style instructions refused: remove the leading and trailing whitespace, which does not survive a reread of the file. The editor re-opens with the trimmed text.",
          "warning",
        );
        prefill = instructions.trim();
        continue;
      }
      return instructions;
    }
  }

  /** Offers the project directory only in a trusted project; with one candidate no dialog opens. */
  async function selectTargetDirectory(ctx: StyleExtensionContext): Promise<string | undefined> {
    const userDir = join(options.agentDir, STYLES_DIR_NAME);
    if (!ctx.isProjectTrusted()) return userDir;
    const projectDir = join(ctx.cwd, options.configDirName, STYLES_DIR_NAME);
    const labels = [`user - ${userDir}`, `project - ${projectDir}`];
    const choice = await ctx.ui.select("Directory for the new style", labels);
    if (choice === undefined) return undefined;
    return choice === labels[1] ? projectDir : userDir;
  }

  /**
   * ENOENT and ENOTDIR both prove no file sits at the path. Any other failure, EACCES for
   * example, leaves existence unknown, so it is thrown for the caller to report instead of
   * being read as absence and risking a write where a file may sit.
   */
  async function fileExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") return false;
      throw error;
    }
  }

  /**
   * Collection and validation are side-effect free; the filesystem is touched only after every
   * input is collected and valid, so a cancelled or refused flow leaves the disk exactly as it
   * was, directory creation included.
   */
  async function runCreateStyleFlow(ctx: StyleExtensionContext, reportedKeptLists: Set<string>): Promise<void> {
    const name = await collectStyleName(ctx);
    if (name === undefined) return;
    const description = await collectStyleDescription(ctx);
    if (description === undefined) return;
    const directory = await selectTargetDirectory(ctx);
    if (directory === undefined) return;

    // The collision check runs as soon as the target is known, before the instruction editor
    // opens, so nobody types a body for a name that cannot be written. Only a same-directory file
    // is a collision; a name that merely shadows a style from another source stays allowed, per
    // the documented precedence rules.
    const path = join(directory, `${name}${STYLE_FILE_SUFFIX}`);
    try {
      if (await fileExists(path)) {
        notify(ctx, `Style "${name}" was not created: ${path} already exists. Choose a different name.`, "warning");
        return;
      }
    } catch (error) {
      notify(ctx, `Style "${name}" was not created: cannot check ${path}: ${describeError(error)}`, "error");
      return;
    }

    const instructions = await collectStyleInstructions(ctx);
    if (instructions === undefined) return;

    // The task boundary permits creating the directory and the one style file, nothing else, so
    // the content goes straight to the final path instead of through a temporary file.
    try {
      await mkdir(directory, { recursive: true });
      try {
        // "wx" refuses an existing file, so a file that appeared between the check above and this
        // write is reported instead of overwritten.
        await writeFile(path, serializeStyleFile(description, instructions), { encoding: "utf8", flag: "wx" });
      } catch (error) {
        // On EEXIST nothing was created and the file belongs to someone else. Every other failure
        // may have left a partial file this flow created; it is reported, never removed: another
        // process may have replaced the file between the failure and a removal, and a path-based
        // rm cannot tell such a replacement from this flow's leftover.
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          notify(ctx, `An incomplete file may remain at ${path}. Remove it before the name is retried.`, "warning");
        }
        throw error;
      }
    } catch (error) {
      notify(ctx, `Style "${name}" was not created: ${describeError(error)}`, "error");
      return;
    }

    // Activation is by name against the freshly adopted list and goes through the one switch path
    // every other switch uses. When a higher-precedence source already defines the name, that
    // winning definition activates and the written file is shadowed, consistent with the
    // precedence rules. A scan that kept the previous list activates nothing: a same-name entry
    // in the stale list proves nothing about the file just written.
    const adopted = await rescanStyles(ctx, reportedKeptLists);
    const created = adopted ? styles.find((style) => style.name === name) : undefined;
    if (created) {
      await activateStyle(created, ctx);
      return;
    }
    // Reachable only when the rescan kept the previous list, for example a directory regressed to
    // unlistable between the write and the scan; the file exists, so the next adopted scan offers it.
    notify(ctx, `The style file was written to ${path}, but the current style list does not offer "${name}".`, "warning");
  }

  pi.registerCommand(COMMAND_NAME, {
    description: 'Switch the response style for the rest of the session, or create a style with "new"',
    getArgumentCompletions: (argumentPrefix) =>
      styles
        .filter((style) => style.name.startsWith(argumentPrefix))
        .map((style) => ({
          value: style.name,
          label: style.name,
          description: `${style.description} [${style.source}]`,
        })),
    handler: async (args, ctx) => {
      // The create flow is dialogs only, so without a user interface it refuses before the rescan
      // below can emit diagnostics: the invocation produces exactly one explanatory message.
      if (args === NEW_STYLE_NAME && !ctx.hasUI) {
        notify(
          ctx,
          '"/output-style new" needs a user interface: the create flow collects its inputs through dialogs. Write a style file into a style directory instead; the README section "Style File Format" describes the format.',
          "error",
        );
        return;
      }
      // Every invocation, the empty argument included, acts on the current files on disk, so a
      // style file added or edited mid-session needs no session restart. The cycle shortcut and
      // the argument completions keep the in-memory list.
      // One set per invocation: the kept-list report repeats across invocations, and an invocation
      // that scans twice still reports one warning per affected directory.
      const reportedKeptLists = new Set<string>();
      await rescanStyles(ctx, reportedKeptLists);
      // The argument matches exactly and case-sensitively, the same rule the flag uses, so a value
      // with surrounding whitespace is an unknown name and only the truly empty argument opens the
      // selector. Without a user interface no dialog can open, so the same invocation reports the
      // names a scripted caller can pass instead.
      if (args === "") {
        if (ctx.hasUI) await openStyleSelector(ctx);
        else reportStyleNames(ctx);
        return;
      }
      // Discovery reserves the name "new", so this exact argument is always the subcommand and
      // never a discovered style.
      if (args === NEW_STYLE_NAME) {
        await runCreateStyleFlow(ctx, reportedKeptLists);
        return;
      }
      const selected = styles.find((style) => style.name === args);
      if (selected) {
        await activateStyle(selected, ctx);
        return;
      }
      reportUnknownStyle(ctx, args);
    },
  });

  let cycleShortcutRegistered = false;

  /**
   * The cycle shortcut is a terminal surface and is only registered when a user interface exists.
   * That is knowable no earlier than session start, because `hasUI` lives on the handler context,
   * not on the registration API. Pi collects extension shortcuts after session_start has run, so
   * this late registration still binds. The guard keeps repeated session starts, for example a
   * resume or a fork, from registering twice.
   */
  function registerCycleShortcut(): void {
    if (cycleShortcutRegistered) return;
    cycleShortcutRegistered = true;
    pi.registerShortcut(CYCLE_SHORTCUT, {
      description: "Activate the next output style",
      handler: async (ctx) => {
        // Steps through the discovered list order, name-ordered with `default` first, and wraps at
        // the end. The match is by name, not identity, because a rescan replaces the list with
        // freshly parsed objects while activeStyle keeps its old definition. When a rescan removed
        // the active style's name, the index is -1 and the arithmetic lands on the first entry,
        // the built-in default.
        const next = styles[(styles.findIndex((style) => style.name === activeStyle.name) + 1) % styles.length];
        if (next) await activateStyle(next, ctx);
      },
    });
  }

  pi.on("session_start", async (_event, ctx) => {
    if (ctx.hasUI) registerCycleShortcut();
    // Style discovery is a convenience: no problem here may keep the extension from loading, so the whole
    // startup path degrades to the unchanged default style instead of throwing into Pi's startup.
    try {
      styles = [DEFAULT_STYLE];
      activeStyle = DEFAULT_STYLE;

      const discovery = await discoverStyles(styleDirectories(ctx));
      styles = discovery.styles;
      unlistableDirs = new Set(discovery.unlistableDirectories);

      for (const problem of discovery.problems) {
        reportProblemOnce(ctx, problem);
      }

      const requested = pi.getFlag(FLAG_NAME);
      // A missing flag reads as undefined and is no selection attempt. Any supplied value, blank
      // included, is one, so it is either matched or reported as unknown. Style names are matched
      // exactly and case-sensitively.
      const flagValue = typeof requested === "string" ? requested : undefined;

      // An untrusted project's settings file is never read, matching the rule for its style files.
      const projectValue = ctx.isProjectTrusted()
        ? await readPersistedStyleName(join(ctx.cwd, options.configDirName, SETTINGS_FILE_NAME))
        : undefined;
      const globalValue = await readPersistedStyleName(join(options.agentDir, SETTINGS_FILE_NAME));

      // The starting style comes from this resolution alone. The flag is a one-run override and is
      // never written back; a persisted name that no longer resolves is reported once below and its
      // value on disk stays untouched, so a temporarily unavailable project style is not lost.
      const resolution = resolveStartupStyle({ flagValue, projectValue, globalValue, styles });
      activeStyle = resolution.style;

      for (const miss of resolution.unknown) {
        notify(ctx, unknownStartupStyleMessage(miss.origin, miss.name, resolution.style), "warning");
      }
    } catch (error) {
      notify(ctx, `Output styles unavailable: ${describeError(error)}`, "warning");
    } finally {
      // The footer names the active style from session start on, the default style included, so the
      // status is visible before the first switch.
      showFooterStatus(ctx);
    }
  });

  pi.on("before_agent_start", async (event, ctx) => {
    // Pi has no theme-change event and the status text carries baked colors, so a theme switched
    // mid-session leaves the entry in the previous colors. Rendering it again on every turn start
    // repairs that at the next turn; the text is unchanged when the theme is, so nothing flickers.
    showFooterStatus(ctx);
    // The handler receives the chained prompt, so an append-mode value built from it preserves the
    // system prompt changes of extensions that ran earlier in the chain. The structured options may
    // carry full context file contents: they go into applyStyle only, never into notifications.
    try {
      const systemPrompt = applyStyle(event.systemPrompt, activeStyle, event.systemPromptOptions);
      return systemPrompt === event.systemPrompt ? undefined : { systemPrompt };
    } catch (error) {
      notify(ctx, `Output style not applied: ${describeError(error)}`, "warning");
      return undefined;
    }
  });
}
