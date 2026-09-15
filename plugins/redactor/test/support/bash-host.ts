import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AgentToolResult,
  DefaultResourceLoader,
  ExtensionRunner,
  type ExtensionError,
  SettingsManager,
  wrapRegisteredTool,
} from "@earendil-works/pi-coding-agent";
import { expect, vi } from "vitest";
import type { RedactionAlgorithms } from "../../src/application/redaction-engine.ts";
import { CredentialRegistry } from "../../src/domain/credential-registry.ts";
import { createRedactorExtension } from "../../src/extension.ts";
import type { OutputFile } from "../../src/infrastructure/pi/output-store.ts";

// Read `TMPDIR` at call time so every workspace stays under the isolated root that `global-setup.ts` removes.
export function temporaryRoot(): string {
  return tmpdir();
}

export interface BashRun {
  text: string;
  details: unknown;
  error: Error | undefined;
  updates: Array<{ text: string; details: unknown; raw: unknown }>;
  raw: unknown;
}

/**
 * Use Pi's resource loader, `ExtensionRunner`, and `wrapRegisteredTool` to match `AgentSession` execution.
 * Only the UI is replaced, and commands run in real processes.
 */
export async function createBashHost(
  options: {
    algorithms?: Partial<RedactionAlgorithms>;
    projectTrusted?: boolean;
    openOutputFile?: (path: string) => OutputFile;
  } = {},
) {
  const workingDirectory = await mkdtemp(join(temporaryRoot(), "redactor-bash-cwd-"));
  const agentDirectory = await mkdtemp(join(temporaryRoot(), "redactor-bash-agent-"));
  const registry = new CredentialRegistry();

  const loader = new DefaultResourceLoader({
    cwd: workingDirectory,
    agentDir: agentDirectory,
    settingsManager: SettingsManager.inMemory(),
    extensionFactories: [
      {
        name: "redactor",
        factory: createRedactorExtension({
          platform: "darwin",
          registry,
          algorithms: options.algorithms,
          bashSettings: options.openOutputFile ? { openOutputFile: options.openOutputFile } : undefined,
        }),
      },
    ],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await loader.reload();
  const loaded = loader.getExtensions();
  expect(loaded.errors).toEqual([]);
  const extension = loaded.extensions[0]!;

  // Provide a session double because Bash commands receive `PI_SESSION_*` values from the runner context.
  const sessionManager = { getSessionId: () => "redactor-bash-host", getSessionFile: () => undefined };
  const runner = new ExtensionRunner(
    [extension],
    loaded.runtime,
    workingDirectory,
    sessionManager as never,
    {} as never,
  );
  const extensionErrors: ExtensionError[] = [];
  runner.onError((error) => extensionErrors.push(error));
  const ui = { notify: vi.fn(), setWorkingMessage: vi.fn() };
  runner.setUIContext(ui as never, "tui");
  // Bind core because `wrapRegisteredTool` reads active tools through the runtime.
  // Stub other actions because these tests do not call them.
  runner.bindCore(
    {
      sendMessage: vi.fn(),
      sendUserMessage: vi.fn(),
      appendEntry: vi.fn(),
      setSessionName: vi.fn(),
      getSessionName: () => undefined,
      setLabel: vi.fn(),
      getActiveTools: () => ["bash", "read"],
      getAllTools: () => [],
      setActiveTools: vi.fn(),
      refreshTools: vi.fn(),
      getCommands: () => [],
      setModel: vi.fn(async () => true),
      getThinkingLevel: () => "off",
      setThinkingLevel: vi.fn(),
    },
    {
      getModel: () => undefined,
      getScopedModels: () => [],
      isIdle: () => true,
      isProjectTrusted: () => options.projectTrusted ?? false,
      getSignal: () => undefined,
      abort: vi.fn(),
      hasPendingMessages: () => false,
      shutdown: vi.fn(),
      getContextUsage: () => undefined,
      compact: vi.fn(),
      getSystemPrompt: () => "",
    },
  );

  const registeredBash = extension.tools.get("bash");
  expect(registeredBash).toBeDefined();
  const bash = wrapRegisteredTool(registeredBash!, runner);
  let callCount = 0;

  async function runTool(
    name: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
    observe?: (update: BashRun["updates"][number]) => void,
  ): Promise<BashRun> {
    const registered = extension.tools.get(name);
    expect(registered, `tool ${name} is registered`).toBeDefined();
    const tool = wrapRegisteredTool(registered!, runner);
    callCount += 1;
    const updates: BashRun["updates"] = [];
    const onUpdate = (partial: AgentToolResult<unknown>) => {
      const update = { text: textOf(partial.content), details: partial.details, raw: structuredClone(partial) };
      updates.push(update);
      observe?.(update);
    };
    try {
      const result = await tool.execute(`${name}-call-${callCount}`, params, signal, onUpdate);
      return { text: textOf(result.content), details: result.details, error: undefined, updates, raw: result };
    } catch (error) {
      return { text: "", details: undefined, error: error as Error, updates, raw: undefined };
    }
  }

  function runBash(
    command: string,
    signal?: AbortSignal,
    observe?: (update: BashRun["updates"][number]) => void,
  ): Promise<BashRun> {
    return runTool("bash", { command }, signal, observe);
  }

  async function cleanup() {
    await Promise.all([workingDirectory, agentDirectory].map((path) => rm(path, { recursive: true, force: true })));
  }

  return { runBash, runTool, registry, bash, extension, extensionErrors, ui, workingDirectory, cleanup };
}

function textOf(content: ReadonlyArray<{ type: string; text?: string }>): string {
  return content
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n");
}
