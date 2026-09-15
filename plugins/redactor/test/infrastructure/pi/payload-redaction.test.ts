import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { RedactionEngine } from "../../../src/application/redaction-engine.ts";
import { CredentialRegistry } from "../../../src/domain/credential-registry.ts";
import { referenceFor } from "../../../src/domain/text-redaction.ts";
import { redactPayload } from "../../../src/infrastructure/pi/payload-redaction.ts";
import { registerProviderRequestProtection } from "../../../src/infrastructure/pi/provider-request.ts";
import { registerToolResultProtection } from "../../../src/infrastructure/pi/tool-result.ts";

const SECRET = "sk-live-PAYLOAD-0123456789";

function engineWith(...words: string[]) {
  const registry = new CredentialRegistry();
  registry.register("token", SECRET);
  words.forEach((word, index) => registry.register(`word-${index}`, word));
  return new RedactionEngine(registry);
}

type Handler = (event: Record<string, unknown>, ctx: unknown) => unknown;

function captureHandler(name: string, register: (pi: ExtensionAPI) => void): Handler {
  let handler: Handler | undefined;
  const pi = {
    on: (event: string, fn: Handler) => {
      if (event === name) handler = fn;
    },
  } as unknown as ExtensionAPI;
  register(pi);
  expect(handler).toBeDefined();
  return handler!;
}

const ANTHROPIC_PAYLOAD = {
  model: "double",
  system: [{ type: "text", text: `assistant said ${SECRET}` }],
  messages: [
    { role: "user", content: `assistant said ${SECRET}` },
    {
      role: "assistant",
      content: [
        { type: "text", text: `text ${SECRET}` },
        {
          type: "tool_use",
          id: "call-1",
          name: "bash",
          input: { command: SECRET, role: "assistant", [SECRET]: "x", messages: [{ role: "assistant" }] },
        },
      ],
    },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "call-1", content: SECRET, is_error: true }] },
  ],
  tools: [
    {
      name: "bash",
      description: `Runs bash with ${SECRET}`,
      input_schema: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
    },
  ],
  max_tokens: 4,
};

describe("provider payload redaction", () => {
  it("keeps protocol positions of the API family and redacts the same words inside tool inputs", () => {
    const engine = engineWith("assistant", "text", "tool_use", "bash", "messages", "content", "command");

    const result = engine.redactWith((redactValue) =>
      redactPayload(ANTHROPIC_PAYLOAD, "anthropic-messages", redactValue),
    );

    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(result.messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    expect(result.messages[0]!.content).toBe(`${referenceFor("word-0")} said ${referenceFor("token")}`);
    expect(result.system).toEqual([{ type: "text", text: `${referenceFor("word-0")} said ${referenceFor("token")}` }]);
    const blocks = result.messages[1]!.content as Array<Record<string, unknown>>;
    expect(blocks.map((block) => block.type)).toEqual(["text", "tool_use"]);
    expect(blocks[0]!.text).toBe(`${referenceFor("word-1")} ${referenceFor("token")}`);
    expect(blocks[1]!.name).toBe("bash");
    expect(blocks[1]!.input).toEqual({
      [referenceFor("word-6")]: referenceFor("token"),
      role: referenceFor("word-0"),
      [referenceFor("token")]: "x",
      [referenceFor("word-4")]: [{ role: referenceFor("word-0") }],
    });
    const toolResult = (result.messages[2]!.content as Array<Record<string, unknown>>)[0]!;
    expect(toolResult).toEqual({
      type: "tool_result",
      tool_use_id: "call-1",
      content: referenceFor("token"),
      is_error: true,
    });
    expect(result.tools[0]!.name).toBe("bash");
    expect(result.tools[0]!.description).toBe(`Runs ${referenceFor("word-3")} with ${referenceFor("token")}`);
    expect(result.tools[0]!.input_schema).toEqual(ANTHROPIC_PAYLOAD.tools[0]!.input_schema);
    expect(Object.keys(result)).toEqual(Object.keys(ANTHROPIC_PAYLOAD));
  });

  it("redacts everything, roles and names included, for an API family without a shape or without a model", () => {
    const engine = engineWith("assistant", "bash", "messages");
    const payload = { messages: [{ role: "assistant", content: SECRET, name: "bash" }] };

    for (const api of ["unknown-api", undefined]) {
      const result = engine.redactWith((redactValue) => redactPayload(payload, api, redactValue));

      expect(result).toEqual({
        [referenceFor("word-2")]: [
          { role: referenceFor("word-0"), content: referenceFor("token"), name: referenceFor("word-1") },
        ],
      });
    }
  });

  it("redacts a field the shape does not name, its name included, instead of preserving it", () => {
    const engine = engineWith("assistant", "later_field");
    const payload = { model: "double", messages: [], later_field: { role: "assistant", note: SECRET } };

    const result = engine.redactWith((redactValue) => redactPayload(payload, "anthropic-messages", redactValue));

    expect(result).toEqual({
      model: "double",
      messages: [],
      [referenceFor("word-1")]: { role: referenceFor("word-0"), note: referenceFor("token") },
    });
  });

  it("applies the current model's API family through the before_provider_request handler", () => {
    const handler = captureHandler("before_provider_request", (pi) =>
      registerProviderRequestProtection(pi, engineWith("assistant")),
    );
    const payload = { messages: [{ role: "assistant", content: SECRET }] };

    const shaped = handler({ payload }, { abort: vi.fn(), model: { api: "anthropic-messages" } });
    const unshaped = handler({ payload }, { abort: vi.fn(), model: undefined });

    expect(shaped).toEqual({ messages: [{ role: "assistant", content: referenceFor("token") }] });
    expect(unshaped).toEqual({ messages: [{ role: referenceFor("word-0"), content: referenceFor("token") }] });
  });
});

describe("tool result redaction", () => {
  it("keeps content block types and redacts text, details, and detail keys", () => {
    const handler = captureHandler("tool_result", (pi) => registerToolResultProtection(pi, engineWith("text", "png")));

    const result = handler(
      {
        content: [
          { type: "text", text: `text ${SECRET}` },
          { type: "image", data: SECRET, mimeType: "image/png" },
        ],
        details: { [SECRET]: `text ${SECRET}` },
      },
      {},
    );

    expect(result).toEqual({
      content: [
        { type: "text", text: `${referenceFor("word-0")} ${referenceFor("token")}` },
        { type: "image", data: referenceFor("token"), mimeType: `image/${referenceFor("word-1")}` },
      ],
      details: { [referenceFor("token")]: `${referenceFor("word-0")} ${referenceFor("token")}` },
    });
  });

  it("leaves details untouched in the result when the event carries none", () => {
    const handler = captureHandler("tool_result", (pi) => registerToolResultProtection(pi, engineWith()));

    const result = handler({ content: [{ type: "text", text: SECRET }] }, {});

    expect(result).toEqual({ content: [{ type: "text", text: referenceFor("token") }] });
  });

  it("replaces the start of a value left at a truncation cut by a tool the extension does not wrap", () => {
    const handler = captureHandler("tool_result", (pi) => registerToolResultProtection(pi, engineWith()));
    const details = { truncation: { truncated: true } };

    const result = handler({ toolName: "grep", content: [{ type: "text", text: "match sk-live" }], details }, {});

    expect(result).toMatchObject({ content: [{ type: "text", text: `match ${referenceFor("token")}` }] });
  });

  it.each(["bash", "read"])(
    "leaves a truncated %s result alone at its cut, since it was redacted before truncation",
    (toolName) => {
      const handler = captureHandler("tool_result", (pi) => registerToolResultProtection(pi, engineWith()));
      const details = { truncation: { truncated: true } };

      const result = handler({ toolName, content: [{ type: "text", text: "ends in s" }], details }, {});

      expect(result).toMatchObject({ content: [{ type: "text", text: "ends in s" }] });
    },
  );
});
