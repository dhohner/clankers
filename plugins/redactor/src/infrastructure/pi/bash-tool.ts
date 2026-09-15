import { accessSync, constants, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import {
  type AgentToolResult,
  type BashToolDetails,
  createBashToolDefinition,
  createLocalBashOperations,
  DEFAULT_MAX_BYTES,
  type ExtensionAPI,
  type ExtensionContext,
  formatSize,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { describeCause, RedactionEngine, RedactionFailure } from "../../application/redaction-engine.ts";
import { data, object, redactByShape, type Shape } from "../../domain/structured-redaction.ts";
import { type OutputFile, type OutputSnapshot, RedactedOutputStore } from "./output-store.ts";
import { HOST_CONTENT_BLOCKS } from "./provider-shapes.ts";

/**
 * Reports an unusable temporary directory or failure to open, write, or flush the output file.
 * Fixed text and an approved cause name prevent diagnostics from exposing output or paths.
 */
export class OutputStorageFailure extends Error {
  readonly causeName: string;

  constructor(cause: unknown) {
    super("redactor: storing redacted output failed; the command output was withheld");
    this.name = "OutputStorageFailure";
    this.causeName = describeCause(cause);
  }
}

/**
 * Prevents a command from running without its configured shell path or prefix after settings fail to load.
 * Fixed text and an approved cause name keep settings paths out of diagnostics.
 */
export class ShellSettingsFailure extends Error {
  readonly causeName: string;

  constructor(cause: unknown) {
    super("redactor: the shell settings could not be loaded; the command was not run");
    this.name = "ShellSettingsFailure";
    this.causeName = describeCause(cause);
  }
}

export interface ShellSettings {
  shellPath?: string;
  commandPrefix?: string;
}

export interface BashToolSettings {
  cwd: string;
  /** Resolve each execution against its directory, and ignore project settings when `projectTrusted` is false. */
  resolveShell: (cwd: string, projectTrusted: boolean) => ShellSettings;
  openOutputFile?: (path: string) => OutputFile;
}

const UPDATE_THROTTLE_MS = 100;

// Use fixed text because including the rejected path could expose a credential.
const UNPUBLISHABLE_PATH = "the output file path contains a registered value";

type Result = AgentToolResult<BashToolDetails | undefined>;
type Update = ((result: Result) => void) | undefined;

// Preserve result field names because the host reads them, while treating their values as data.
const RESULT_SHAPE: Shape = object({
  content: HOST_CONTENT_BLOCKS,
  details: object({ truncation: object({}, { names: "keep", shape: data }), fullOutputPath: data }),
});

/**
 * Own the output store to handle file failures and let slow writes block the process instead of filling memory.
 *
 * Match the built in tool by resolving session settings for each execution directory and its reported trust.
 * Untrusted projects contribute no project settings.
 *
 * Deep redact complete updates and results so no field can expose a registered value.
 * Fix the output path before execution because a changed path would be useless to the model.
 *
 * Reject an unsafe initial path before execution.
 * Stop before publishing a path made unsafe by a later registration.
 *
 * Fail stream setup, temporary directory checks, and initial path checks before spawning the process.
 * After spawning, stop on storage or redaction failure and withhold remaining output.
 * Never rerun the command because it may already have changed external state.
 */
export function registerRedactingBashTool(pi: ExtensionAPI, engine: RedactionEngine, settings: BashToolSettings): void {
  const template = createBashToolDefinition(settings.cwd);
  pi.registerTool({
    ...template,
    execute: (toolCallId, params, signal, onUpdate, ctx) =>
      executeRedacted(engine, settings, params, signal, onUpdate, ctx),
  });
}

async function executeRedacted(
  engine: RedactionEngine,
  settings: BashToolSettings,
  params: { command: string; timeout?: number },
  signal: AbortSignal | undefined,
  onUpdate: Update,
  ctx: ExtensionContext,
): Promise<Result> {
  const cwd = ctx.cwd || settings.cwd;
  const shell = settings.resolveShell(cwd, ctx.isProjectTrusted());
  const command = shell.commandPrefix ? `${shell.commandPrefix}\n${params.command}` : params.command;
  const operations = createLocalBashOperations({ shellPath: shell.shellPath });

  let failure: RedactionFailure | OutputStorageFailure | undefined;
  let accepting = true;
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  const fail = (error: RedactionFailure | OutputStorageFailure) => {
    failure ??= error;
    accepting = false;
    stream.discard();
    controller.abort();
  };
  const store = new RedactedOutputStore({ openOutputFile: settings.openOutputFile });
  const stream = engine.openByteStream();
  try {
    assertOutputDirectoryWritable();
  } catch (error) {
    throw new OutputStorageFailure(error);
  }
  assertPublishablePath(engine, store.plannedOutputPath);

  const protect = (result: Result): Result => {
    const safe = engine.redactWith((redactValue) => redactByShape(result, RESULT_SHAPE, redactValue));
    if (safe.details?.fullOutputPath !== result.details?.fullOutputPath) {
      throw new OutputStorageFailure(new Error(UNPUBLISHABLE_PATH));
    }
    return safe;
  };

  let updateTimer: NodeJS.Timeout | undefined;
  let updateDirty = false;
  let lastUpdateAt = 0;
  const emitUpdate = () => {
    if (!onUpdate || !updateDirty) return;
    updateDirty = false;
    lastUpdateAt = Date.now();
    const snapshot = store.snapshot();
    let update: Result;
    try {
      update = protect({
        content: [{ type: "text", text: snapshot.content || "" }],
        details: {
          truncation: snapshot.truncation.truncated ? snapshot.truncation : undefined,
          fullOutputPath: snapshot.fullOutputPath,
        },
      });
    } catch (error) {
      fail(asFailure(error));
      return;
    }
    onUpdate(update);
  };
  const clearUpdateTimer = () => {
    if (!updateTimer) return;
    clearTimeout(updateTimer);
    updateTimer = undefined;
  };
  const scheduleUpdate = () => {
    if (!onUpdate) return;
    updateDirty = true;
    const delay = UPDATE_THROTTLE_MS - (Date.now() - lastUpdateAt);
    if (delay <= 0) {
      clearUpdateTimer();
      emitUpdate();
      return;
    }
    updateTimer ??= setTimeout(() => {
      updateTimer = undefined;
      emitUpdate();
    }, delay);
  };

  const storeText = (text: string) => {
    try {
      store.append(text);
    } catch (error) {
      fail(new OutputStorageFailure(error));
      return;
    }
    scheduleUpdate();
  };
  const onData = (bytes: Buffer) => {
    if (!accepting) return;
    let text: string;
    try {
      text = stream.push(bytes);
    } catch (error) {
      fail(error instanceof RedactionFailure ? error : new RedactionFailure("stream-push", error));
      return;
    }
    storeText(text);
  };
  const finishOutput = async (): Promise<OutputSnapshot> => {
    accepting = false;
    clearUpdateTimer();
    emitUpdate();
    const snapshot = store.snapshot();
    try {
      await store.close();
    } catch (error) {
      throw new OutputStorageFailure(error);
    }
    return snapshot;
  };
  const withholdOutput = async (): Promise<never> => {
    accepting = false;
    clearUpdateTimer();
    await store.close().catch(() => undefined);
    throw failure;
  };

  onUpdate?.({ content: [], details: undefined });
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    let exitCode: number | null;
    try {
      const result = await operations.exec(command, cwd, {
        onData,
        signal: controller.signal,
        timeout: params.timeout,
        env: sessionEnvironment(ctx),
      });
      exitCode = result.exitCode;
    } catch (error) {
      if (failure) return await withholdOutput();
      // Drop pending text after cancellation or timeout because it may start an interrupted credential value.
      stream.discard();
      const text = textOf(protect(formatOutput(await finishOutput(), store.lastLineBytes, "")));
      if (failure) return await withholdOutput();
      if (error instanceof Error && error.message === "aborted") {
        throw new Error(appendStatus(text, "Command aborted"), { cause: error });
      }
      if (error instanceof Error && error.message.startsWith("timeout:")) {
        const seconds = error.message.split(":")[1];
        throw new Error(appendStatus(text, `Command timed out after ${seconds} seconds`), { cause: error });
      }
      throw error;
    }
    accepting = false;
    if (failure) return await withholdOutput();
    let remainder: string;
    try {
      remainder = stream.finish();
    } catch (error) {
      failure = error instanceof RedactionFailure ? error : new RedactionFailure("stream-finish", error);
      return await withholdOutput();
    }
    storeText(remainder);
    if (failure) return await withholdOutput();
    const result = protect(formatOutput(await finishOutput(), store.lastLineBytes));
    if (failure) return await withholdOutput();
    const text = textOf(result);
    if (exitCode !== 0 && exitCode !== null) {
      throw new Error(appendStatus(text, `Command exited with code ${exitCode}`));
    }
    return result;
  } finally {
    clearUpdateTimer();
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

function asFailure(error: unknown): RedactionFailure | OutputStorageFailure {
  if (error instanceof RedactionFailure || error instanceof OutputStorageFailure) return error;
  return new RedactionFailure("structure", error);
}

function assertPublishablePath(engine: RedactionEngine, path: string): void {
  if (engine.redactText(path) !== path) throw new OutputStorageFailure(new Error(UNPUBLISHABLE_PATH));
}

function textOf(result: Result): string {
  return result.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("");
}

// Match the built in result text so the model receives the same truncation footers.
function formatOutput(snapshot: OutputSnapshot, lastLineBytes: number, emptyText = "(no output)"): Result {
  const truncation = snapshot.truncation;
  let text = snapshot.content || emptyText;
  if (!truncation.truncated) return { content: [{ type: "text", text }], details: undefined };
  const details = { truncation, fullOutputPath: snapshot.fullOutputPath };
  const startLine = truncation.totalLines - truncation.outputLines + 1;
  const endLine = truncation.totalLines;
  if (truncation.lastLinePartial) {
    text += `\n\n[Showing last ${formatSize(truncation.outputBytes)} of line ${endLine} (line is ${formatSize(lastLineBytes)}). Full output: ${snapshot.fullOutputPath}]`;
  } else if (truncation.truncatedBy === "lines") {
    text += `\n\n[Showing lines ${startLine}-${endLine} of ${truncation.totalLines}. Full output: ${snapshot.fullOutputPath}]`;
  } else {
    text += `\n\n[Showing lines ${startLine}-${endLine} of ${truncation.totalLines} (${formatSize(DEFAULT_MAX_BYTES)} limit). Full output: ${snapshot.fullOutputPath}]`;
  }
  return { content: [{ type: "text", text }], details };
}

function appendStatus(text: string, status: string): string {
  return `${text ? `${text}\n\n` : ""}${status}`;
}

// Match the built in environment by adding the agent bin directory and current `PI_*` values.
function sessionEnvironment(ctx: ExtensionContext): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const binDir = join(getAgentDir(), "bin");
  const entries = (env[pathKey] ?? "").split(delimiter).filter(Boolean);
  if (!entries.includes(binDir)) env[pathKey] = [binDir, ...entries].join(delimiter);
  delete env.PI_SESSION_ID;
  delete env.PI_SESSION_FILE;
  delete env.PI_PROVIDER;
  delete env.PI_MODEL;
  delete env.PI_REASONING_LEVEL;
  env.PI_SESSION_ID = ctx.sessionManager.getSessionId();
  const sessionFile = ctx.sessionManager.getSessionFile();
  if (sessionFile) env.PI_SESSION_FILE = sessionFile;
  if (ctx.model) {
    env.PI_PROVIDER = ctx.model.provider;
    env.PI_MODEL = ctx.model.id;
  }
  if (ctx.thinkingLevel) env.PI_REASONING_LEVEL = ctx.thinkingLevel;
  return env;
}

function assertOutputDirectoryWritable(): void {
  const directory = tmpdir();
  if (!statSync(directory).isDirectory()) throw new Error("temporary path is not a directory");
  accessSync(directory, constants.W_OK);
}
