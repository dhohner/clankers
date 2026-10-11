import { join } from "node:path";
import { describeError } from "../errors.ts";
import { createStyleSession, type SessionReport } from "../session/style-session.ts";
import type { StartupOrigin } from "../session/startup-selection.ts";
import { styleFileSystem, type StyleFileSystem } from "../storage/filesystem.ts";
import { SETTINGS_FILE_NAME } from "../storage/settings.ts";
import { stylePersistence, type StylePersistence } from "../storage/style-persistence.ts";
import { discoverStyles, type StyleDirectories } from "../styles/discovery.ts";
import { applyStyle } from "../styles/prompt.ts";
import { DEFAULT_STYLE, NEW_STYLE_NAME, type StyleDefinition } from "../styles/types.ts";
import { type CreateFlowDependencies, type CreateFlowTargets, runCreateStyleFlow } from "./create-flow.ts";
import type { NotifyLevel, StyleExtensionApi, StyleExtensionContext } from "./host-contracts.ts";
import { formatStatusText } from "./status.ts";

export const FLAG_NAME = "output-style";

export const COMMAND_NAME = "output-style";

export const CYCLE_SHORTCUT = "ctrl+shift+y";

export const STATUS_KEY = "output-style";

export const STYLES_DIR_NAME = "output-styles";

export type StyleExtensionOptions = {
  bundledDir: string;
  agentDir: string;
  configDirName: string;
  filesystem?: StyleFileSystem;
  persistence?: StylePersistence;
};

export function registerOutputStyles(pi: StyleExtensionApi, options: StyleExtensionOptions): void {
  const filesystem = options.filesystem ?? styleFileSystem;
  const persistence = options.persistence ?? stylePersistence;
  const session = createStyleSession({ discover: (directories) => discoverStyles(directories, filesystem) });
  const globalSettingsPath = join(options.agentDir, SETTINGS_FILE_NAME);
  let cycleShortcutRegistered = false;

  pi.registerFlag(FLAG_NAME, {
    description: "Response style to apply to the agent system prompt for this session",
    type: "string",
  });

  function notify(ctx: StyleExtensionContext, message: string, level: NotifyLevel): void {
    if (ctx.hasUI) {
      ctx.ui.notify(message, level);

      return;
    }

    // Print and JSON mode reserve stdout for the answer stream.
    process.stderr.write(`output-styles: ${message}\n`);
  }

  function showFooterStatus(ctx: StyleExtensionContext): void {
    if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, formatStatusText(session.active(), ctx.ui.theme));
  }

  function styleTargetDirectories(ctx: StyleExtensionContext): CreateFlowTargets {
    return {
      userDir: join(options.agentDir, STYLES_DIR_NAME),
      projectDir: ctx.isProjectTrusted() ? join(ctx.cwd, options.configDirName, STYLES_DIR_NAME) : undefined,
    };
  }

  function styleDirectories(ctx: StyleExtensionContext): StyleDirectories {
    return { bundledDir: options.bundledDir, ...styleTargetDirectories(ctx) };
  }

  function reportSession(ctx: StyleExtensionContext, reports: SessionReport[]): void {
    for (const report of reports) {
      if (report.kind === "scan-failed") {
        notify(ctx, `Output styles keep the previous list: ${report.failure}`, "warning");
        continue;
      }

      const prefix = report.kind === "kept" ? "Output styles keep the previous list" : "Output style skipped";
      notify(ctx, `${prefix}: ${report.problem.path} (${report.problem.reason})`, "warning");
    }
  }

  async function rescanStyles(ctx: StyleExtensionContext, reportedKeptLists: Set<string>): Promise<boolean> {
    const result = await session.refresh(styleDirectories(ctx), reportedKeptLists);
    reportSession(ctx, result.reports);

    if (result.status === "retained") return false;

    if (result.fallback !== undefined) {
      showFooterStatus(ctx);
      notify(
        ctx,
        `Output style "${result.fallback}" is no longer available. The built-in "${DEFAULT_STYLE.name}" style is now active.`,
        "warning",
      );
    }

    return true;
  }

  function projectSettingsPath(ctx: StyleExtensionContext): string {
    return join(ctx.cwd, options.configDirName, SETTINGS_FILE_NAME);
  }

  function settingsPathFor(ctx: StyleExtensionContext): string {
    return ctx.isProjectTrusted() ? projectSettingsPath(ctx) : globalSettingsPath;
  }

  async function activateStyle(style: StyleDefinition, ctx: StyleExtensionContext): Promise<void> {
    session.select(style);
    showFooterStatus(ctx);
    notify(ctx, `Output style "${style.name}" is active from the next turn on.`, "info");

    try {
      await persistence.write(settingsPathFor(ctx), style.name);
    } catch (cause) {
      notify(
        ctx,
        `Output style "${style.name}" stays active for this session but could not be persisted: ${describeError(cause)}`,
        "warning",
      );
    }
  }

  async function readStartupValue(ctx: StyleExtensionContext, path: string): Promise<string | undefined> {
    const read = await persistence.read(path);

    if (read.status === "failed") {
      notify(
        ctx,
        `Output style settings could not be read: ${path} (${read.failure}). The session continues.`,
        "warning",
      );

      return undefined;
    }

    return read.status === "selected" ? read.value : undefined;
  }

  function unknownStartupStyleMessage(origin: StartupOrigin, name: string, resolved: StyleDefinition): string {
    const from = origin === "flag" ? "" : ` persisted in ${origin} settings`;

    return `Unknown output style "${name}"${from}. Using "${resolved.name}". Available: ${session
      .styles()
      .map((style) => style.name)
      .join(", ")}`;
  }

  function reportUnknownStyle(ctx: StyleExtensionContext, requested: string): void {
    notify(
      ctx,
      `Unknown output style "${requested}". The active style stays "${session.active().name}". Available: ${session
        .styles()
        .map((style) => style.name)
        .join(", ")}`,
      "warning",
    );
  }

  function selectorLabel(style: StyleDefinition): string {
    const activeMark = style.name === session.active().name ? " (active)" : "";

    return `${style.name}${activeMark} - ${style.description} [${style.source}]`;
  }

  function reportStyleNames(ctx: StyleExtensionContext): void {
    notify(
      ctx,
      `Available output styles: ${session
        .styles()
        .map((style) => style.name)
        .join(", ")}. The active style is "${session.active().name}". Switch with "/output-style <name>".`,
      "info",
    );
  }

  async function openStyleSelector(ctx: StyleExtensionContext): Promise<void> {
    // Keep the catalogue shown by the dialog even if another command adopts a scan meanwhile.
    const offered = session.styles();
    const labels = offered.map(selectorLabel);
    const choice = await ctx.ui.select("Select output style", labels);

    if (choice === undefined) return;

    const selected = offered[labels.indexOf(choice)];

    if (selected) await activateStyle(selected, ctx);
  }

  function createFlowDependencies(ctx: StyleExtensionContext, reportedKeptLists: Set<string>): CreateFlowDependencies {
    return {
      ui: ctx.ui,
      filesystem,
      targetDirectories: () => styleTargetDirectories(ctx),
      notify: (message, level) => notify(ctx, message, level),
      rescanStyles: () => rescanStyles(ctx, reportedKeptLists),
      findStyle: session.find,
      activateStyle: (style) => activateStyle(style, ctx),
    };
  }

  pi.registerCommand(COMMAND_NAME, {
    description: 'Switch the response style for the rest of the session, or create a style with "new"',
    getArgumentCompletions: (argumentPrefix) =>
      session
        .styles()
        .filter((style) => style.name.startsWith(argumentPrefix))
        .map((style) => ({
          value: style.name,
          label: style.name,
          description: `${style.description} [${style.source}]`,
        })),
    handler: async (args, ctx) => {
      // Refuse before scanning so this invocation emits exactly one explanatory message.
      if (args === NEW_STYLE_NAME && !ctx.hasUI) {
        notify(
          ctx,
          '"/output-style new" needs a user interface: the create flow collects its inputs through dialogs. Write a style file into a style directory instead; the README section "Style File Format" describes the format.',
          "error",
        );

        return;
      }

      const reportedKeptLists = new Set<string>();
      await rescanStyles(ctx, reportedKeptLists);

      if (args === "") {
        if (ctx.hasUI) await openStyleSelector(ctx);
        else reportStyleNames(ctx);

        return;
      }

      if (args === NEW_STYLE_NAME) {
        await runCreateStyleFlow(createFlowDependencies(ctx, reportedKeptLists));

        return;
      }

      const selected = session.find(args);

      if (selected) {
        await activateStyle(selected, ctx);

        return;
      }

      reportUnknownStyle(ctx, args);
    },
  });

  function registerCycleShortcut(): void {
    if (cycleShortcutRegistered) return;

    cycleShortcutRegistered = true;
    pi.registerShortcut(CYCLE_SHORTCUT, {
      description: "Activate the next output style",
      handler: async (ctx) => activateStyle(session.next(), ctx),
    });
  }

  pi.on("session_start", async (_event, ctx) => {
    // Pi collects shortcuts after startup; headless sessions have no terminal shortcut surface.
    if (ctx.hasUI) registerCycleShortcut();

    try {
      const result = await session.initialize(styleDirectories(ctx));

      if (result.status === "failed") {
        notify(ctx, `Output styles unavailable: ${result.failure}`, "warning");

        return;
      }

      reportSession(ctx, result.reports);
      const requested = pi.getFlag(FLAG_NAME);
      const flagValue = requested === undefined || requested === true || requested === false ? undefined : requested;
      const projectValue = ctx.isProjectTrusted() ? await readStartupValue(ctx, projectSettingsPath(ctx)) : undefined;
      const globalValue = await readStartupValue(ctx, globalSettingsPath);
      const resolution = session.selectStartup({ flagValue, projectValue, globalValue });

      for (const miss of resolution.unknown) {
        notify(ctx, unknownStartupStyleMessage(miss.origin, miss.name, resolution.style), "warning");
      }
    } catch (cause) {
      notify(ctx, `Output styles unavailable: ${describeError(cause)}`, "warning");
    } finally {
      showFooterStatus(ctx);
    }
  });

  pi.on("before_agent_start", async (event, ctx) => {
    // Pi has no theme-change event; re-rendering repairs the footer colors on the next turn.
    showFooterStatus(ctx);

    try {
      const systemPrompt = applyStyle(event.systemPrompt, session.active());

      return systemPrompt === event.systemPrompt ? undefined : { systemPrompt };
    } catch (cause) {
      notify(ctx, `Output style not applied: ${describeError(cause)}`, "warning");

      return undefined;
    }
  });
}
