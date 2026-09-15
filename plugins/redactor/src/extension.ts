import {
  type ExtensionAPI,
  type ExtensionFactory,
  getAgentDir,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { RedactionEngine, type RedactionAlgorithms } from "./application/redaction-engine.ts";
import { CredentialRegistry } from "./domain/credential-registry.ts";
import {
  type BashToolSettings,
  registerRedactingBashTool,
  ShellSettingsFailure,
} from "./infrastructure/pi/bash-tool.ts";
import { registerInputProtection } from "./infrastructure/pi/input.ts";
import { registerContextProtection, registerFinalizedMessageProtection } from "./infrastructure/pi/messages.ts";
import { registerProviderRequestProtection } from "./infrastructure/pi/provider-request.ts";
import { registerRedactingReadTool } from "./infrastructure/pi/read-tool.ts";
import { registerLoadWarning, registerUnsupportedPlatformNotice } from "./infrastructure/pi/startup.ts";
import { registerSummaryProtection } from "./infrastructure/pi/summaries.ts";
import { registerToolResultProtection } from "./infrastructure/pi/tool-result.ts";

export const PROTECTED_EVENTS = [
  "input",
  "message_end",
  "tool_result",
  "context",
  "before_provider_request",
  "session_before_compact",
  "session_before_tree",
] as const;

export interface RedactorOptions {
  platform?: NodeJS.Platform;
  registry?: CredentialRegistry;
  algorithms?: Partial<RedactionAlgorithms>;
  terminalWidth?: () => number | undefined;
  bashSettings?: Partial<BashToolSettings>;
}

export function isSupportedPlatform(platform: NodeJS.Platform): boolean {
  return platform === "darwin";
}

export function createRedactorExtension(options: RedactorOptions = {}): ExtensionFactory {
  const platform = options.platform ?? process.platform;
  const registry = options.registry ?? new CredentialRegistry();
  const engine = new RedactionEngine(registry, options.algorithms);
  const terminalWidth = options.terminalWidth ?? (() => (process.stdout.isTTY ? process.stdout.columns : undefined));

  return (pi: ExtensionAPI) => {
    if (!isSupportedPlatform(platform)) {
      registerUnsupportedPlatformNotice(pi);
      return;
    }
    registerLoadWarning(pi, terminalWidth);
    registerInputProtection(pi, engine);
    registerFinalizedMessageProtection(pi, engine);
    registerToolResultProtection(pi, engine);
    registerContextProtection(pi, engine);
    registerProviderRequestProtection(pi, engine);
    registerSummaryProtection(pi, engine);
    const bashSettings = { ...defaultBashSettings(), ...options.bashSettings };
    registerRedactingBashTool(pi, engine, bashSettings);
    registerRedactingReadTool(pi, engine, bashSettings.cwd);
  };
}

// Session settings merge project values over global values.
// Resolve them for every execution so project changes and resumed sessions use current values.
// Reject load errors, including lock failures, because the manager otherwise turns them into empty settings.
function defaultBashSettings(): BashToolSettings {
  return {
    cwd: process.cwd(),
    resolveShell: (cwd, projectTrusted) => {
      const settings = SettingsManager.create(cwd, getAgentDir(), { projectTrusted });
      const [loadError] = settings.drainErrors();
      if (loadError) throw new ShellSettingsFailure(loadError.error);
      return { shellPath: settings.getShellPath(), commandPrefix: settings.getShellCommandPrefix() };
    },
  };
}
