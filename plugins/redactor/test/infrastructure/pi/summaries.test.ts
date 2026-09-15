import type { AssistantMessage, Context, Model, SimpleStreamOptions } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { RedactionEngine } from "../../../src/application/redaction-engine.ts";
import { CredentialRegistry } from "../../../src/domain/credential-registry.ts";
import { referenceFor } from "../../../src/domain/text-redaction.ts";
import { summarizerStreamFunction } from "../../../src/infrastructure/pi/summaries.ts";

const SECRET = "sk-live-SUMMARY-0123456789";
const MODEL = { id: "double", api: "pi-messages", provider: "synthetic" } as Model<"pi-messages">;
const CONTEXT: Context = { messages: [] };

function assistant(model: Model<"pi-messages">, text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
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
    stopReason: "stop",
    timestamp: 0,
  };
}

/** Match `pi-ai` payload construction and convert thrown payload hooks into unsent error results. */
function registryDouble(sent: unknown[]) {
  return {
    complete: async (model: Model<"pi-messages">, context: Context, options?: SimpleStreamOptions) => {
      const payload = { model: model.id, context, options: {} };
      try {
        const replaced = await options?.onPayload?.(payload, model);
        sent.push(replaced === undefined ? payload : replaced);
      } catch (error) {
        return { ...assistant(model, ""), stopReason: "error", errorMessage: String(error) } as AssistantMessage;
      }
      return assistant(model, "summary");
    },
  };
}

describe("summarizer request path", () => {
  it("redacts the provider payload of a summary request before it is sent", async () => {
    const registry = new CredentialRegistry();
    registry.register("token", SECRET);
    const sent: unknown[] = [];
    const ctx = { modelRegistry: registryDouble(sent) } as unknown as ExtensionContext;
    const streamFn = summarizerStreamFunction(ctx, new RedactionEngine(registry));
    const context: Context = { messages: [{ role: "user", content: `raw ${SECRET}`, timestamp: 0 }] };

    const result = await (await streamFn(MODEL, context, {})).result();

    expect(result.stopReason).toBe("stop");
    expect(sent).toHaveLength(1);
    expect(JSON.stringify(sent[0])).not.toContain(SECRET);
    expect(JSON.stringify(sent[0])).toContain(`raw ${referenceFor("token")}`);
  });

  it("fails the summary request with a fixed message and sends nothing when payload redaction fails", async () => {
    const registry = new CredentialRegistry();
    registry.register("token", SECRET);
    const engine = new RedactionEngine(registry, {
      redactText: (text) => {
        throw new Error(`boom ${text}`);
      },
    });
    const sent: unknown[] = [];
    const ctx = { modelRegistry: registryDouble(sent) } as unknown as ExtensionContext;
    const streamFn = summarizerStreamFunction(ctx, engine);
    const context: Context = { messages: [{ role: "user", content: `raw ${SECRET}`, timestamp: 0 }] };

    const result = await (await streamFn(MODEL, context, {})).result();

    expect(result.stopReason).toBe("error");
    expect(result.errorMessage).toMatch(/redaction failed/);
    expect(result.errorMessage).not.toContain(SECRET);
    expect(sent).toEqual([]);
  });

  it("runs a payload hook supplied by the summarizer before redacting its result", async () => {
    const registry = new CredentialRegistry();
    registry.register("token", SECRET);
    const sent: unknown[] = [];
    const ctx = { modelRegistry: registryDouble(sent) } as unknown as ExtensionContext;
    const streamFn = summarizerStreamFunction(ctx, new RedactionEngine(registry));

    const stream = await streamFn(MODEL, CONTEXT, {
      onPayload: (payload) => ({ ...(payload as object), injected: `late ${SECRET}` }),
    });
    const result = await stream.result();

    expect(result.stopReason).toBe("stop");
    expect(JSON.stringify(sent[0])).not.toContain(SECRET);
    expect(JSON.stringify(sent[0])).toContain(`late ${referenceFor("token")}`);
  });
});
