import { type AssistantMessage, createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import {
  compact,
  type ExtensionAPI,
  type ExtensionContext,
  generateBranchSummary,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { type DeepRedactor, RedactionFailure, type RedactionEngine } from "../../application/redaction-engine.ts";
import { redactByShape } from "../../domain/structured-redaction.ts";
import { redactMessage } from "./message-redaction.ts";
import { redactPayload } from "./payload-redaction.ts";
import { HOST_SESSION_ENTRY } from "./provider-shapes.ts";

type CompactionPreparation = Parameters<typeof compact>[0];
type StreamFunction = NonNullable<Parameters<typeof compact>[7]>;

const COMPACTION_CANCELLED_NOTICE = "Redactor: compaction was cancelled because its summary could not be protected.";
const BRANCH_SUMMARY_CANCELLED_NOTICE =
  "Redactor: navigation was cancelled because the branch summary could not be protected.";

/**
 * The host persists compaction and branch summaries without a `message_end` hook.
 * Generate them through the host summarizers and model registry so the extension can redact each result.
 *
 * The model registry runs neither `context` nor `before_provider_request`.
 * Redact summarizer entries first, then redact the serialized request through its payload hook.
 * Cancel after any failure because the host fallback is unprotected.
 */
export function registerSummaryProtection(pi: ExtensionAPI, engine: RedactionEngine): void {
  pi.on("session_before_compact", async (event, ctx) => {
    const model = ctx.model;
    if (!model) return { cancel: true };
    try {
      const { preparation, customInstructions } = engine.redactWith((redactValue) => ({
        preparation: redactPreparation(event.preparation, redactValue),
        customInstructions: event.customInstructions === undefined ? undefined : redactValue(event.customInstructions),
      }));
      const result = await compactThroughHost(
        preparation,
        model,
        customInstructions,
        event.signal,
        summarizerStreamFunction(ctx, engine),
        ctx.sessionManager.getSessionId(),
      );
      if (event.signal.aborted) return { cancel: true };
      return { compaction: engine.redactDeep(result) };
    } catch (error) {
      notifyCancelled(ctx, COMPACTION_CANCELLED_NOTICE, error, engine);
      return { cancel: true };
    }
  });

  pi.on("session_before_tree", async (event, ctx) => {
    const { preparation, signal } = event;
    if (!preparation.userWantsSummary || preparation.entriesToSummarize.length === 0) return undefined;
    const model = ctx.model;
    if (!model) return { cancel: true };
    try {
      const { entries, customInstructions } = engine.redactWith((redactValue) => ({
        entries: preparation.entriesToSummarize.map((entry) => redactEntry(entry, redactValue)),
        customInstructions:
          preparation.customInstructions === undefined ? undefined : redactValue(preparation.customInstructions),
      }));
      const result = await generateBranchSummary(entries, {
        model,
        signal,
        customInstructions,
        replaceInstructions: preparation.replaceInstructions,
        streamFn: summarizerStreamFunction(ctx, engine),
      });
      if (result.aborted || signal.aborted) return { cancel: true };
      if (result.error !== undefined) throw new Error(result.error);
      return {
        summary: engine.redactDeep({
          summary: result.summary ?? "",
          details: { readFiles: result.readFiles ?? [], modifiedFiles: result.modifiedFiles ?? [] },
          usage: result.usage,
        }),
      };
    } catch (error) {
      notifyCancelled(ctx, BRANCH_SUMMARY_CANCELLED_NOTICE, error, engine);
      return { cancel: true };
    }
  });
}

/**
 * Name each positional option from the host's 0.85.1 `compact` signature.
 * The stream function's registry resolves authentication and environment values.
 * Omit retry and thinking settings as documented in `README.md`.
 */
function compactThroughHost(
  preparation: CompactionPreparation,
  model: Parameters<typeof compact>[1],
  customInstructions: string | undefined,
  signal: AbortSignal,
  streamFn: StreamFunction,
  sessionId: string,
): ReturnType<typeof compact> {
  const apiKey: string | undefined = undefined;
  const headers: Record<string, string> | undefined = undefined;
  const thinkingLevel: Parameters<typeof compact>[6] = undefined;
  const env: Record<string, string> | undefined = undefined;
  const retry: Parameters<typeof compact>[9] = undefined;
  const callbacks: Parameters<typeof compact>[10] = undefined;
  return compact(
    preparation,
    model,
    apiKey,
    headers,
    customInstructions,
    signal,
    thinkingLevel,
    streamFn,
    env,
    retry,
    callbacks,
    sessionId,
  );
}

/** Redact prompt inputs while preserving compaction bookkeeping. */
function redactPreparation(preparation: CompactionPreparation, redactValue: DeepRedactor): CompactionPreparation {
  return {
    ...preparation,
    messagesToSummarize: preparation.messagesToSummarize.map((message) => redactMessage(message, redactValue)),
    turnPrefixMessages: preparation.turnPrefixMessages.map((message) => redactMessage(message, redactValue)),
    previousSummary: preparation.previousSummary === undefined ? undefined : redactValue(preparation.previousSummary),
  };
}

function redactEntry(entry: SessionEntry, redactValue: DeepRedactor): SessionEntry {
  return redactByShape(entry, HOST_SESSION_ENTRY, (value) => redactValue(value));
}

/**
 * Adapt registry `complete()` results into streams because the extension registry exposes only that method.
 * The summarizers read only the final stream result.
 *
 * Run any summarizer payload hook before redacting the serialized request with its API shape.
 * A redaction failure becomes a `pi-ai` error result before any request is sent.
 */
export function summarizerStreamFunction(ctx: ExtensionContext, engine: RedactionEngine): StreamFunction {
  return (model, context, options) => {
    const stream = createAssistantMessageEventStream();
    const onPayload: NonNullable<typeof options>["onPayload"] = async (payload, requestModel) => {
      const upstream = await options?.onPayload?.(payload, requestModel);
      const current = upstream === undefined ? payload : upstream;
      return engine.redactWith((redactValue) => redactPayload(current, requestModel.api, redactValue));
    };
    void (async () => {
      let message: AssistantMessage;
      try {
        message = await ctx.modelRegistry.complete(model, context, { ...options, onPayload });
      } catch (error) {
        message = failedAssistantMessage(model, options?.signal?.aborted ? "aborted" : "error", error);
      }
      if (message.stopReason === "error" || message.stopReason === "aborted") {
        stream.push({ type: "error", reason: message.stopReason, error: message });
      } else if (message.stopReason === "pending") {
        stream.push({ type: "error", reason: "error", error: { ...message, stopReason: "error" } });
      } else {
        stream.push({ type: "done", reason: message.stopReason, message });
      }
      stream.end();
    })();
    return stream;
  };
}

function failedAssistantMessage(
  model: Parameters<StreamFunction>[0],
  stopReason: "aborted" | "error",
  error: unknown,
): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason,
    errorMessage: error instanceof Error ? error.message : String(error),
    timestamp: Date.now(),
  };
}

function notifyCancelled(ctx: ExtensionContext, notice: string, error: unknown, engine: RedactionEngine): void {
  let detail = "";
  if (error instanceof RedactionFailure) {
    detail = ` ${error.message}`;
  } else if (error instanceof Error) {
    try {
      detail = ` ${engine.redactText(error.message)}`;
    } catch {
      detail = "";
    }
  }
  ctx.ui.notify(`${notice}${detail}`, "error");
}
