import type { Context, Tool } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { RedactionEngine } from "../../../src/application/redaction-engine.ts";
import { CredentialRegistry } from "../../../src/domain/credential-registry.ts";
import { referenceFor } from "../../../src/domain/text-redaction.ts";
import { redactPayload } from "../../../src/infrastructure/pi/payload-redaction.ts";
import {
  captureRealPayload,
  collectField,
  collectKeys,
  PAYLOAD_FAMILIES,
  type PayloadFamily,
  replaceStrings,
  toolInputs,
  withoutToolInputs,
} from "../../support/provider-payloads.ts";

const SECRET = "sk-live-PROVIDERS-0123456789";
const REFERENCE = referenceFor("token");

/**
 * Register protocol words that do not occur inside the plain context data.
 * The payload must remain unchanged when these roles, types, names, ids, schema names, and schema keywords are registered.
 *
 * Exclude `command` because tool input uses it as a data key.
 * Exclude `message` and `messages` because the `pi-messages` API name contains them as data.
 * Exclude the model id because host messages also carry it as data.
 */
const PROTOCOL_WORDS = [
  "system",
  "developer",
  "user",
  "assistant",
  "tool",
  "model",
  "toolResult",
  "text",
  "input_text",
  "output_text",
  "tool_use",
  "tool_result",
  "function",
  "function_call",
  "function_call_output",
  "reasoning",
  "thinking",
  "toolCall",
  "toolUse",
  "ephemeral",
  "base64",
  "auto",
  "completed",
  "medium",
  "bash",
  "call_1",
  "content",
  "input",
  "contents",
  "parts",
  "role",
  "type",
  "name",
  "arguments",
  "args",
  "id",
  "tools",
  "tool_calls",
  "toolCalls",
  "parameters",
  "parametersJsonSchema",
  "input_schema",
  "inputSchema",
  "properties",
  "required",
  "mode",
  "description",
  "instructions",
  "stream",
  "max_tokens",
  "temperature",
  "tool_choice",
  "config",
  "toolConfig",
  "functionDeclarations",
  "inferenceConfig",
  "toolSpec",
  "json",
  "context",
  "options",
  "signature",
  "image",
  "image_url",
  "input_image",
  "inlineData",
  "data",
  "mimeType",
  "media_type",
  "source",
  "url",
  "detail",
  "output",
  "call_id",
  "status",
  "store",
  "object",
  "string",
  "array",
  "boolean",
  "null",
];

interface ContextOptions {
  secret: string;
  nestedInput: Record<string, unknown>;
  images?: boolean;
  isError?: boolean;
}

function contextFor(family: PayloadFamily, options: ContextOptions): Context {
  const { secret, nestedInput } = options;
  const image = { type: "image" as const, data: "aGVsbG8=", mimeType: "image/png" };
  const images = options.images === false ? [] : [image];
  const usage = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
  return {
    systemPrompt: `Greetings. The value is ${secret}.`,
    messages: [
      { role: "user", content: `Proceed with ${secret} now.`, timestamp: 1 },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: `Pondering ${secret}`, thinkingSignature: family.thinkingSignature },
          { type: "text", text: `Running with ${secret}` },
          {
            type: "toolCall",
            id: "call_1",
            name: "bash",
            arguments: { command: `echo ${secret}`, nested: nestedInput, [secret]: "keyed" },
          },
        ],
        api: family.api,
        provider: "synthetic",
        model: "double",
        usage,
        stopReason: "toolUse",
        timestamp: 2,
      },
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "bash",
        content: [{ type: "text", text: `Printed ${secret}` }, ...images],
        details: { [secret]: secret },
        isError: options.isError !== false,
        timestamp: 3,
      },
      { role: "user", content: [{ type: "text", text: `Again ${secret}` }, ...images], timestamp: 4 },
    ],
    tools: [
      {
        name: "bash",
        description: `Runs a shell line, for example with ${secret}`,
        parameters: {
          type: "object",
          properties: {
            command: { type: "string", description: `Shell line such as ${secret}` },
            mode: { type: "string", enum: ["fast", "slow"] },
          },
          required: ["command"],
        } as unknown as Tool["parameters"],
      },
    ],
  };
}

function engineWith(entries: Record<string, string>) {
  const registry = new CredentialRegistry();
  for (const [id, value] of Object.entries(entries)) registry.register(id, value);
  return new RedactionEngine(registry);
}

function redact(engine: RedactionEngine, family: PayloadFamily, payload: unknown): unknown {
  return engine.redactWith((redactValue) => redactPayload(payload, family.api, redactValue));
}

describe.each(PAYLOAD_FAMILIES)("real $api payloads", (family) => {
  it("keeps a payload without registered data unchanged when every protocol word is registered", async () => {
    const payload = await captureRealPayload(
      family,
      contextFor(family, { secret: "plain-value", nestedInput: { note: "plain" }, images: false, isError: false }),
    );
    const engine = engineWith(Object.fromEntries(PROTOCOL_WORDS.map((word, index) => [`word-${index}`, word])));

    const redacted = redact(engine, family, payload);

    expect(redacted).toEqual(payload);
    expect(redacted).not.toBe(payload);
  });

  it("redacts a registered value from every data position, property names and serialized arguments included", async () => {
    const payload = await captureRealPayload(
      family,
      contextFor(family, { secret: SECRET, nestedInput: { note: SECRET } }),
    );
    const engine = engineWith({ token: SECRET });

    const redacted = redact(engine, family, payload);

    expect(JSON.stringify(payload)).toContain(SECRET);
    expect(JSON.stringify(redacted)).not.toContain(SECRET);
    expect(redacted).toEqual(replaceStrings(payload, (text) => text.replaceAll(SECRET, REFERENCE)));
  });

  it("redacts protocol words inside tool call inputs while the surrounding protocol stays intact", async () => {
    const payload = await captureRealPayload(
      family,
      contextFor(family, { secret: "plain-value", nestedInput: { role: "assistant", tool: "bash", type: "text" } }),
    );
    const engine = engineWith({ role: "assistant", tool: "bash", block: "text" });

    const redacted = redact(engine, family, payload);

    expect(withoutToolInputs(family, redacted)).toEqual(withoutToolInputs(family, payload));
    expect(toolInputs(family, redacted)).toEqual([
      {
        command: "echo plain-value",
        nested: { role: referenceFor("role"), tool: referenceFor("tool"), type: referenceFor("block") },
        "plain-value": "keyed",
      },
    ]);
    const [stripped, original] = [withoutToolInputs(family, redacted), withoutToolInputs(family, payload)];
    expect(collectField(stripped, "role")).toEqual(collectField(original, "role"));
    expect(collectField(stripped, "name")).toEqual(collectField(original, "name"));
  });

  it("keeps every property name outside tool inputs when the names of message and content fields are registered", async () => {
    const payload = await captureRealPayload(
      family,
      contextFor(family, { secret: "plain-value", nestedInput: { note: "plain" } }),
    );
    const engine = engineWith({
      a: "messages",
      b: "message",
      c: "content",
      d: "input",
      e: "tools",
      f: "context",
      g: "text",
    });

    const redacted = redact(engine, family, payload);

    expect(collectKeys(withoutToolInputs(family, redacted))).toEqual(collectKeys(withoutToolInputs(family, payload)));
    expect(collectField(redacted, "role")).toEqual(collectField(payload, "role"));
    expect(collectField(redacted, "type")).toEqual(collectField(payload, "type"));
  });

  it("keeps image block types while redacting the media type, which is data", async () => {
    const payload = await captureRealPayload(
      family,
      contextFor(family, { secret: "plain-value", nestedInput: { note: "plain" } }),
    );
    const engine = engineWith({ word: "image", item: "message" });

    const redacted = redact(engine, family, payload);

    expect(collectField(redacted, "type")).toEqual(collectField(payload, "type"));
    expect(collectField(redacted, "role")).toEqual(collectField(payload, "role"));
    expect(JSON.stringify(redacted)).not.toContain("image/png");
    // Bedrock decodes images into bytes and a bare format, so only other families retain the media type.
    if (JSON.stringify(payload).includes("image/png")) {
      expect(JSON.stringify(redacted)).toContain(`${referenceFor("word")}/png`);
    }
  });
});
