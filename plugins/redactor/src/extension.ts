import { join } from "node:path";
import {
  CONFIG_DIR_NAME,
  type ExtensionAPI,
  type ExtensionFactory,
  getAgentDir,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { GuidanceCapabilities } from "./application/credential-guidance.ts";
import { CredentialSources } from "./application/credential-sources.ts";
import { RedactionEngine, type RedactionAlgorithms } from "./application/redaction-engine.ts";
import { CredentialRegistry } from "./domain/credential-registry.ts";
import { SelectionFile } from "./infrastructure/node/selection-file.ts";
import {
  type BashToolSettings,
  registerRedactingBashTool,
  ShellSettingsFailure,
} from "./infrastructure/pi/bash-tool.ts";
import { registerCredentialCommand } from "./infrastructure/pi/credential-command.ts";
import { registerCredentialStartup } from "./infrastructure/pi/credential-startup.ts";
import { registerCredentialGuidance } from "./infrastructure/pi/guidance.ts";
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

export interface CredentialOptions {
  /** Resolved when the extension loads, so tests can isolate the Pi agent directory. */
  userConfigPath: () => string;
  projectConfigPath: (cwd: string) => string;
  /** Reads the running process environment only. */
  readVariable: (name: string) => string | undefined;
  generateReference?: () => string;
}

export interface RedactorOptions {
  platform?: NodeJS.Platform;
  registry?: CredentialRegistry;
  algorithms?: Partial<RedactionAlgorithms>;
  terminalWidth?: () => number | undefined;
  bashSettings?: Partial<BashToolSettings>;
  credentials?: Partial<CredentialOptions>;
}

/** No execution or private entry capability exists yet; later capabilities replace these values. */
export const INSTALLED_CAPABILITIES: GuidanceCapabilities = { approvedExecution: false, privateEntry: false };

export function isSupportedPlatform(platform: NodeJS.Platform): boolean {
  return platform === "darwin";
}

export function createRedactorExtension(options: RedactorOptions = {}): ExtensionFactory {
  const platform = options.platform ?? process.platform;
  const registry = options.registry ?? new CredentialRegistry();
  const engine = new RedactionEngine(registry, options.algorithms);
  const terminalWidth = options.terminalWidth ?? (() => (process.stdout.isTTY ? process.stdout.columns : undefined));
  const credentials = { ...defaultCredentialOptions(), ...options.credentials };
  // Share sources with the registry, so a reloaded extension instance keeps its references.
  let sources: CredentialSources | undefined;

  return (pi: ExtensionAPI) => {
    if (!isSupportedPlatform(platform)) {
      registerUnsupportedPlatformNotice(pi);
      return;
    }
    sources ??= new CredentialSources({
      file: new SelectionFile(credentials.userConfigPath()),
      registry,
      engine,
      readVariable: credentials.readVariable,
      generateReference: credentials.generateReference,
    });
    registerLoadWarning(pi, terminalWidth);
    registerCredentialStartup(pi, sources, credentials);
    registerCredentialCommand(pi, sources);
    registerCredentialGuidance(pi, sources, INSTALLED_CAPABILITIES);
    registerInputProtection(pi, engine);
    registerFinalizedMessageProtection(pi, engine);
    registerToolResultProtection(pi, engine);
    registerContextProtection(pi, engine);
    registerProviderRequestProtection(pi, engine);
    registerSummaryProtection(pi, engine);
    const selectedVariableNames = () => sources!.selectedNames();
    const bashSettings = { ...defaultBashSettings(), selectedVariableNames, ...options.bashSettings };
    registerRedactingBashTool(pi, engine, bashSettings);
    registerRedactingReadTool(pi, engine, bashSettings.cwd);
  };
}

function defaultCredentialOptions(): CredentialOptions {
  return {
    userConfigPath: () => join(getAgentDir(), "redactor", "credentials.json"),
    projectConfigPath: (cwd) => join(cwd, CONFIG_DIR_NAME, "redactor", "credentials.json"),
    readVariable: (name) => process.env[name],
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
