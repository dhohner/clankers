import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Api,
  type AssistantMessage,
  type Context,
  createAssistantMessageEventStream,
  type Model,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import {
  type AgentSessionEvent,
  createAgentSession,
  DefaultResourceLoader,
  type ExtensionError,
  type ExtensionFactory,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { expect, vi } from "vitest";
import type { RedactionAlgorithms } from "../../src/application/redaction-engine.ts";
import { CredentialRegistry } from "../../src/domain/credential-registry.ts";
import { createRedactorExtension } from "../../src/extension.ts";

export interface ScriptedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ScriptedTurn {
  text?: string;
  toolCalls?: ScriptedToolCall[];
}

export interface CapturedRequest {
  payload: unknown;
  context: Context;
}

export interface Workspace {
  root: string;
  cwd: string;
  agentDir: string;
  sessionDir: string;
}

export async function createWorkspace(): Promise<Workspace> {
  const root = await mkdtemp(join(tmpdir(), "redactor-session-"));
  return { root, cwd: join(root, "cwd"), agentDir: join(root, "agent"), sessionDir: join(root, "sessions") };
}

export interface SyntheticHostOptions {
  workspace?: Workspace;
  sessionFile?: string;
  registry?: CredentialRegistry;
  algorithms?: Partial<RedactionAlgorithms>;
  script?: ScriptedTurn[];
  compaction?: { enabled?: boolean; reserveTokens?: number; keepRecentTokens?: number };
  extraExtensions?: ExtensionFactory[];
  tools?: string[];
}

const ZERO_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

/**
 * Use a real `AgentSession`, real session files, and Pi's resource loader.
 * Register a deterministic provider double on the model runtime to record payloads and replay scripted turns.
 *
 * Keep all requests inside the process.
 * Use `pi-messages` because its request preserves the Pi context and matches the `pi-ai` 0.85.1 payload shape.
 */
export async function createSyntheticHost(options: SyntheticHostOptions = {}) {
  const workspace = options.workspace ?? (await createWorkspace());
  const { mkdir } = await import("node:fs/promises");
  await Promise.all(
    [workspace.cwd, workspace.agentDir, workspace.sessionDir].map((path) => mkdir(path, { recursive: true })),
  );
  const registry = options.registry ?? new CredentialRegistry();
  const script = [...(options.script ?? [])];
  const requests: CapturedRequest[] = [];
  const events: AgentSessionEvent[] = [];
  const extensionErrors: ExtensionError[] = [];

  const modelRuntime = await ModelRuntime.create({
    authPath: join(workspace.agentDir, "auth.json"),
    modelsPath: null,
    refreshOnCreate: false,
  });
  modelRuntime.registerProvider("synthetic", {
    // Use a refusing loopback address in case the provider double fails to answer in process.
    baseUrl: "http://127.0.0.1:9/never",
    apiKey: "synthetic-provider-key",
    api: "pi-messages",
    streamSimple: (model, context, streamOptions) => replay(model, context, streamOptions, script, requests),
    models: [
      {
        id: "double",
        name: "Synthetic double",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200_000,
        maxTokens: 4096,
      },
    ],
  });
  const model = modelRuntime.getModel("synthetic", "double");
  expect(model).toBeDefined();

  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false, ...options.compaction },
    retry: { enabled: false },
  });
  const resourceLoader = new DefaultResourceLoader({
    cwd: workspace.cwd,
    agentDir: workspace.agentDir,
    settingsManager,
    extensionFactories: [
      {
        name: "redactor",
        factory: createRedactorExtension({
          platform: "darwin",
          registry,
          algorithms: options.algorithms,
          bashSettings: { cwd: workspace.cwd, resolveShell: () => ({}) },
          terminalWidth: () => 80,
        }),
      },
      ...(options.extraExtensions ?? []).map((factory, index) => ({ name: `third-party-${index}`, factory })),
    ],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: "You are a synthetic transport double used by the redactor tests.",
  });
  await resourceLoader.reload();
  expect(resourceLoader.getExtensions().errors).toEqual([]);

  const sessionManager = options.sessionFile
    ? SessionManager.open(options.sessionFile, workspace.sessionDir)
    : SessionManager.create(workspace.cwd, workspace.sessionDir);
  const { session } = await createAgentSession({
    cwd: workspace.cwd,
    agentDir: workspace.agentDir,
    modelRuntime,
    model,
    thinkingLevel: "off",
    settingsManager,
    sessionManager,
    resourceLoader,
    tools: options.tools ?? ["bash"],
  });
  session.subscribe((event) => {
    events.push(event);
  });
  const ui = { notify: vi.fn(), setWorkingMessage: vi.fn(), confirm: vi.fn(), select: vi.fn(), input: vi.fn() };
  await session.bindExtensions({
    uiContext: ui as never,
    mode: "tui",
    onError: (error) => extensionErrors.push(error),
  });

  async function readSessionFile(): Promise<string> {
    expect(session.sessionFile).toBeDefined();
    return readFile(session.sessionFile!, "utf8");
  }

  async function waitUntilStreaming(timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!session.isStreaming) {
      if (Date.now() > deadline) throw new Error("agent did not start streaming");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  async function cleanup(): Promise<void> {
    session.dispose();
    await rm(workspace.root, { recursive: true, force: true });
  }

  return {
    session,
    registry,
    workspace,
    requests,
    events,
    extensionErrors,
    ui,
    script,
    readSessionFile,
    waitUntilStreaming,
    cleanup,
  };
}

function replay(
  model: Model<Api>,
  context: Context,
  streamOptions: SimpleStreamOptions | undefined,
  script: ScriptedTurn[],
  requests: CapturedRequest[],
) {
  const stream = createAssistantMessageEventStream();
  void (async () => {
    const payload = {
      model: model.id,
      context,
      options: {
        temperature: streamOptions?.temperature,
        maxTokens: streamOptions?.maxTokens,
        reasoning: streamOptions?.reasoning,
        cacheRetention: "short",
        sessionId: streamOptions?.sessionId,
        toolChoice: streamOptions?.toolChoice,
      },
    };
    let replaced: unknown;
    try {
      replaced = await streamOptions?.onPayload?.(payload, model);
    } catch (error) {
      stream.push({
        type: "error",
        reason: "error",
        error: {
          role: "assistant",
          content: [],
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage: { ...ZERO_USAGE, cost: { ...ZERO_USAGE.cost } },
          stopReason: "error",
          errorMessage: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        },
      });
      stream.end();
      return;
    }
    requests.push({ payload: replaced === undefined ? payload : replaced, context });

    const turn = script.shift() ?? { text: "scripted turns exhausted" };
    const message: AssistantMessage = {
      role: "assistant",
      content: [],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: { ...ZERO_USAGE, cost: { ...ZERO_USAGE.cost } },
      stopReason: "pending",
      timestamp: Date.now(),
    };
    stream.push({ type: "start", partial: message });
    if (turn.text !== undefined) {
      const contentIndex = message.content.length;
      message.content.push({ type: "text", text: turn.text });
      stream.push({ type: "text_start", contentIndex, partial: message });
      stream.push({ type: "text_end", contentIndex, content: turn.text, partial: message });
    }
    for (const [index, call] of (turn.toolCalls ?? []).entries()) {
      const contentIndex = message.content.length;
      const toolCall = {
        type: "toolCall" as const,
        id: `call-${requests.length}-${index}`,
        name: call.name,
        arguments: call.arguments,
      };
      message.content.push(toolCall);
      stream.push({ type: "toolcall_start", contentIndex, partial: message });
      stream.push({ type: "toolcall_end", contentIndex, toolCall, partial: message });
    }
    message.stopReason = turn.toolCalls?.length ? "toolUse" : "stop";
    stream.push({ type: "done", reason: message.stopReason, message });
    stream.end();
  })();
  return stream;
}
