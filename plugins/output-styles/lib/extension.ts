import { join } from "node:path";
import type { BuildSystemPromptOptions, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describeError, discoverStyles } from "./discovery.ts";
import { applyStyle } from "./prompt.ts";
import {
  readPersistedStyleName,
  resolveStartupStyle,
  SETTINGS_FILE_NAME,
  type StartupOrigin,
  writePersistedStyleName,
} from "./settings.ts";
import { DEFAULT_STYLE, type StyleDefinition, type StyleProblem } from "./types.ts";

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
    setStatus(key: string, text: string | undefined): void;
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
    if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, `style:${activeStyle.name}`);
  }

  function styleDirectories(ctx: StyleExtensionContext): Parameters<typeof discoverStyles>[0] {
    return {
      bundledDir: options.bundledDir,
      userDir: join(options.agentDir, STYLES_DIR_NAME),
      projectDir: ctx.isProjectTrusted() ? join(ctx.cwd, options.configDirName, STYLES_DIR_NAME) : undefined,
    };
  }

  function reportProblemOnce(ctx: StyleExtensionContext, problem: StyleProblem, message?: string): void {
    // NUL cannot occur in a path, so the joined key cannot collide across different pairs.
    const key = `${problem.path}\u0000${problem.reason}`;
    if (reportedProblems.has(key)) return;
    reportedProblems.add(key);
    notify(ctx, message ?? `Output style skipped: ${problem.path} (${problem.reason})`, "warning");
  }

  /**
   * Serializes the command-handler scans: Pi runs command handlers unserialized, and chaining the
   * scans keeps two concurrent invocations from interleaving their scan and adoption steps, so the
   * scan adopted last is also the scan started last. Scans never reject, so the chain cannot stall.
   */
  let scanChain: Promise<void> = Promise.resolve();

  function rescanStyles(ctx: StyleExtensionContext): Promise<void> {
    const run = scanChain.then(() => scanAndAdoptStyles(ctx));
    scanChain = run;
    return run;
  }

  /**
   * Refreshes the style list from disk so the command acts on the current files. When the scan
   * cannot list a directory the most recent adopted scan listed successfully, the fresh list would
   * silently drop that directory's styles, so the previous list stays in use; a directory that was
   * already unlistable does not block adoption. The active style keeps its in-memory definition
   * either way: following the file is a successor capability.
   */
  async function scanAndAdoptStyles(ctx: StyleExtensionContext): Promise<void> {
    try {
      const discovery = await discoverStyles(styleDirectories(ctx));
      const regressed = new Set(discovery.unlistableDirectories.filter((dir) => !unlistableDirs.has(dir)));
      for (const problem of discovery.problems) {
        reportProblemOnce(
          ctx,
          problem,
          regressed.has(problem.path)
            ? `Output styles keep the previous list: ${problem.path} (${problem.reason})`
            : undefined,
        );
      }
      if (regressed.size > 0) return;
      styles = discovery.styles;
      unlistableDirs = new Set(discovery.unlistableDirectories);
    } catch (error) {
      notify(ctx, `Output styles keep the previous list: ${describeError(error)}`, "warning");
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

  pi.registerCommand(COMMAND_NAME, {
    description: "Switch the response style for the rest of the session",
    getArgumentCompletions: (argumentPrefix) =>
      styles
        .filter((style) => style.name.startsWith(argumentPrefix))
        .map((style) => ({
          value: style.name,
          label: style.name,
          description: `${style.description} [${style.source}]`,
        })),
    handler: async (args, ctx) => {
      // Every invocation, the empty argument included, acts on the current files on disk, so a
      // style file added or edited mid-session needs no session restart. The cycle shortcut and
      // the argument completions keep the in-memory list.
      await rescanStyles(ctx);
      // The argument matches exactly and case-sensitively, the same rule the flag uses, so a value
      // with surrounding whitespace is an unknown name and only the truly empty argument opens the
      // selector. Without a user interface no dialog can open, so the same invocation reports the
      // names a scripted caller can pass instead.
      if (args === "") {
        if (ctx.hasUI) await openStyleSelector(ctx);
        else reportStyleNames(ctx);
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
