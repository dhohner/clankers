import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describeError, discoverStyles } from "./discovery.ts";
import { applyStyle } from "./prompt.ts";
import { DEFAULT_STYLE, type StyleDefinition } from "./types.ts";

export const FLAG_NAME = "output-style";

/** Directory name holding style files inside the agent directory and inside the project config directory. */
export const STYLES_DIR_NAME = "output-styles";

type NotifyLevel = "info" | "warning" | "error";

// Deliberate structural subsets of Pi's own API and handler context: the extension only needs these
// members, and tests can build them directly. The assertions below stop the subsets from drifting away
// from Pi, which would otherwise compile cleanly and fail only at runtime.
export type StyleExtensionContext = {
  hasUI: boolean;
  cwd: string;
  isProjectTrusted(): boolean;
  ui: { notify(message: string, type?: NotifyLevel): void };
};

export type StyleExtensionApi = {
  registerFlag(name: string, options: { description?: string; type: "boolean" | "string" }): void;
  getFlag(name: string): boolean | string | undefined;
  on(
    event: "session_start",
    handler: (event: { type: "session_start" }, ctx: StyleExtensionContext) => Promise<void> | void,
  ): void;
  on(
    event: "before_agent_start",
    handler: (
      event: { systemPrompt: string },
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

  pi.registerFlag(FLAG_NAME, {
    description: "Response style to apply to the agent system prompt for this session",
    type: "string",
  });

  function notify(ctx: StyleExtensionContext, message: string, level: NotifyLevel): void {
    if (ctx.hasUI) ctx.ui.notify(message, level);
  }

  pi.on("session_start", async (_event, ctx) => {
    // Style discovery is a convenience: no problem here may keep the extension from loading, so the whole
    // startup path degrades to the unchanged default style instead of throwing into Pi's startup.
    try {
      styles = [DEFAULT_STYLE];
      activeStyle = DEFAULT_STYLE;

      const discovery = await discoverStyles({
        bundledDir: options.bundledDir,
        userDir: join(options.agentDir, STYLES_DIR_NAME),
        projectDir: ctx.isProjectTrusted() ? join(ctx.cwd, options.configDirName, STYLES_DIR_NAME) : undefined,
      });
      styles = discovery.styles;

      for (const problem of discovery.problems) {
        notify(ctx, `Output style skipped: ${problem.path} (${problem.reason})`, "warning");
      }

      const requested = pi.getFlag(FLAG_NAME);
      // A missing flag keeps the default style silently. Any supplied value, blank included, is a
      // selection attempt, so it is either matched or reported as unknown.
      if (typeof requested !== "string") return;

      // Style names are matched exactly and case-sensitively.
      const selected = styles.find((style) => style.name === requested);
      if (selected) {
        activeStyle = selected;
        return;
      }

      notify(
        ctx,
        `Unknown output style "${requested}". Using "${DEFAULT_STYLE.name}". Available: ${styles
          .map((style) => style.name)
          .join(", ")}`,
        "warning",
      );
    } catch (error) {
      notify(ctx, `Output styles unavailable: ${describeError(error)}`, "warning");
    }
  });

  pi.on("before_agent_start", async (event, ctx) => {
    // The handler receives the chained prompt, so returning a value built from it preserves the system
    // prompt changes of extensions that ran earlier in the chain.
    try {
      const systemPrompt = applyStyle(event.systemPrompt, activeStyle);
      return systemPrompt === event.systemPrompt ? undefined : { systemPrompt };
    } catch (error) {
      notify(ctx, `Output style not applied: ${describeError(error)}`, "warning");
      return undefined;
    }
  });
}
