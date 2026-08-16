import { join } from "node:path";
import type { BuildSystemPromptOptions, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  type CreateFlowDependencies,
  type CreateFlowTargets,
  type CreateFlowUi,
  runCreateStyleFlow,
} from "./create-flow.ts";
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
import {
  DEFAULT_STYLE,
  NEW_STYLE_NAME,
  type NotifyLevel,
  type StyleDefinition,
  type StyleProblem,
} from "./types.ts";

export const FLAG_NAME = "output-style";

export const COMMAND_NAME = "output-style";

export const CYCLE_SHORTCUT = "ctrl+shift+y";

/** Footer status key. One key per extension, so a new text replaces the previous one. */
export const STATUS_KEY = "output-style";

/** Directory name holding style files inside the agent directory and inside the project config directory. */
export const STYLES_DIR_NAME = "output-styles";

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
  // The dialog members come from the create flow's own surface, so that module states what it
  // needs and this type stays the single description of Pi's handler context.
  ui: CreateFlowUi & {
    notify(message: string, type?: NotifyLevel): void;
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

  /** The two writable style directories: the project one only in a trusted project. */
  function styleTargetDirectories(ctx: StyleExtensionContext): CreateFlowTargets {
    return {
      userDir: join(options.agentDir, STYLES_DIR_NAME),
      projectDir: ctx.isProjectTrusted() ? join(ctx.cwd, options.configDirName, STYLES_DIR_NAME) : undefined,
    };
  }

  function styleDirectories(ctx: StyleExtensionContext): Parameters<typeof discoverStyles>[0] {
    return { bundledDir: options.bundledDir, ...styleTargetDirectories(ctx) };
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

  /**
   * Reads one settings file for the startup resolution. A failed read is reported and yields no
   * value, so resolution continues with the remaining sources: the two files report independently,
   * and an unreadable file never looks like a fresh installation.
   */
  async function readStartupValue(ctx: StyleExtensionContext, path: string): Promise<string | undefined> {
    const read = await readPersistedStyleName(path);
    if (read.status === "failed") {
      notify(ctx, `Output style settings could not be read: ${path} (${read.failure}). The session continues.`, "warning");
      return undefined;
    }
    return read.status === "selected" ? read.value : undefined;
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
   * Binds the create flow to this session: the flow itself keeps no state, so every value it needs
   * beyond its dialogs arrives here, bound to the invocation's context and kept-list report set.
   */
  function createFlowDependencies(ctx: StyleExtensionContext, reportedKeptLists: Set<string>): CreateFlowDependencies {
    return {
      ui: ctx.ui,
      targetDirectories: () => styleTargetDirectories(ctx),
      notify: (message, level) => notify(ctx, message, level),
      rescanStyles: () => rescanStyles(ctx, reportedKeptLists),
      findStyle: (name) => styles.find((style) => style.name === name),
      activateStyle: (style) => activateStyle(style, ctx),
    };
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
        await runCreateStyleFlow(createFlowDependencies(ctx, reportedKeptLists));
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
        ? await readStartupValue(ctx, join(ctx.cwd, options.configDirName, SETTINGS_FILE_NAME))
        : undefined;
      const globalValue = await readStartupValue(ctx, join(options.agentDir, SETTINGS_FILE_NAME));

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
