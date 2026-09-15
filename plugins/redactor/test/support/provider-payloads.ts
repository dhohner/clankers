import type { Api, AssistantMessageEventStream, Context, Model, SimpleStreamOptions } from "@earendil-works/pi-ai";
import * as anthropicMessages from "@earendil-works/pi-ai/api/anthropic-messages";
import * as bedrockConverseStream from "@earendil-works/pi-ai/api/bedrock-converse-stream";
import * as googleGenerativeAi from "@earendil-works/pi-ai/api/google-generative-ai";
import * as googleVertex from "@earendil-works/pi-ai/api/google-vertex";
import * as mistralConversations from "@earendil-works/pi-ai/api/mistral-conversations";
import * as openaiCompletions from "@earendil-works/pi-ai/api/openai-completions";
import * as openaiResponses from "@earendil-works/pi-ai/api/openai-responses";
import * as piMessages from "@earendil-works/pi-ai/api/pi-messages";
import { expect } from "vitest";

type Node = Record<string, unknown>;
type StreamFunction = (
  model: Model<Api>,
  context: Context,
  options?: SimpleStreamOptions,
) => AssistantMessageEventStream;

export interface PayloadFamily {
  api: Api;
  stream: StreamFunction;
  thinkingSignature: string;
  isToolCall: (node: Node) => boolean;
  readInput: (node: Node) => unknown;
  writeInput: (node: Node, input: unknown) => Node;
}

const jsonArguments = (path: "function" | "self") => ({
  isToolCall: (node: Node) =>
    path === "function"
      ? isNode(node.function) && typeof node.function.arguments === "string"
      : node.type === "function_call" && typeof node.arguments === "string",
  readInput: (node: Node) =>
    JSON.parse(path === "function" ? ((node.function as Node).arguments as string) : (node.arguments as string)),
  writeInput: (node: Node, input: unknown) =>
    path === "function"
      ? { ...node, function: { ...(node.function as Node), arguments: JSON.stringify(input) } }
      : { ...node, arguments: JSON.stringify(input) },
});

export const PAYLOAD_FAMILIES: readonly PayloadFamily[] = [
  {
    api: "anthropic-messages",
    stream: anthropicMessages.streamSimple as StreamFunction,
    thinkingSignature: "sig-1",
    isToolCall: (node) => node.type === "tool_use",
    readInput: (node) => node.input,
    writeInput: (node, input) => ({ ...node, input }),
  },
  {
    api: "openai-completions",
    stream: openaiCompletions.streamSimple as StreamFunction,
    thinkingSignature: "reasoning_content",
    ...jsonArguments("function"),
  },
  {
    api: "openai-responses",
    stream: openaiResponses.streamSimple as StreamFunction,
    thinkingSignature: JSON.stringify({ type: "reasoning", id: "rs_1", summary: [], encrypted_content: "enc-1" }),
    ...jsonArguments("self"),
  },
  {
    api: "bedrock-converse-stream",
    stream: bedrockConverseStream.streamSimple as StreamFunction,
    thinkingSignature: "sig-1",
    isToolCall: (node) => isNode(node.toolUse),
    readInput: (node) => (node.toolUse as Node).input,
    writeInput: (node, input) => ({ ...node, toolUse: { ...(node.toolUse as Node), input } }),
  },
  {
    api: "google-generative-ai",
    stream: googleGenerativeAi.streamSimple as StreamFunction,
    thinkingSignature: "sig-1",
    isToolCall: (node) => isNode(node.functionCall),
    readInput: (node) => (node.functionCall as Node).args,
    writeInput: (node, input) => ({ ...node, functionCall: { ...(node.functionCall as Node), args: input } }),
  },
  {
    api: "google-vertex",
    stream: googleVertex.streamSimple as StreamFunction,
    thinkingSignature: "sig-1",
    isToolCall: (node) => isNode(node.functionCall),
    readInput: (node) => (node.functionCall as Node).args,
    writeInput: (node, input) => ({ ...node, functionCall: { ...(node.functionCall as Node), args: input } }),
  },
  {
    api: "mistral-conversations",
    stream: mistralConversations.streamSimple as StreamFunction,
    thinkingSignature: "sig-1",
    ...jsonArguments("function"),
  },
  {
    api: "pi-messages",
    stream: piMessages.streamSimple as StreamFunction,
    thinkingSignature: "sig-1",
    isToolCall: (node) => node.type === "toolCall",
    readInput: (node) => node.arguments,
    writeInput: (node, input) => ({ ...node, arguments: input }),
  },
];

export function syntheticModel(api: Api): Model<Api> {
  return {
    id: "double",
    name: "Synthetic double",
    api,
    provider: "synthetic",
    baseUrl: "http://127.0.0.1:9/never",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200_000,
    maxTokens: 4096,
  } as Model<Api>;
}

class PayloadCaptured extends Error {}

/**
 * Run the real `streamSimple` until it builds the provider native payload.
 * Capture the payload and throw from the hook before any request is sent.
 * The loopback URL also refuses connections if that safeguard fails.
 */
export async function captureRealPayload(family: PayloadFamily, context: Context): Promise<unknown> {
  let captured: { payload: unknown } | undefined;
  const stream = family.stream(syntheticModel(family.api), context, {
    apiKey: "synthetic-provider-key",
    sessionId: "session-1",
    maxTokens: 256,
    temperature: 0.5,
    reasoning: "medium",
    toolChoice: "auto",
    onPayload: (payload) => {
      captured = { payload };
      throw new PayloadCaptured("captured");
    },
  });
  for await (const event of stream) {
    if (event.type === "error") break;
  }
  expect(captured, `${family.api} produced no payload`).toBeDefined();
  return captured!.payload;
}

export function mapToolInputs(
  family: PayloadFamily,
  payload: unknown,
  transform: (input: unknown) => unknown,
): unknown {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!isNode(value)) return value;
    if (family.isToolCall(value)) return family.writeInput(value, transform(family.readInput(value)));
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item)]));
  };
  return visit(payload);
}

export function toolInputs(family: PayloadFamily, payload: unknown): unknown[] {
  const inputs: unknown[] = [];
  mapToolInputs(family, payload, (input) => {
    inputs.push(input);
    return input;
  });
  return inputs;
}

export function withoutToolInputs(family: PayloadFamily, payload: unknown): unknown {
  return mapToolInputs(family, payload, () => null);
}

export function collectField(payload: unknown, field: string): unknown[] {
  const found: unknown[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!isNode(value)) return;
    if (Object.hasOwn(value, field)) found.push(value[field]);
    for (const item of Object.values(value)) visit(item);
  };
  visit(payload);
  return found;
}

export function collectKeys(payload: unknown): string[] {
  const keys: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!isNode(value)) return;
    for (const [key, item] of Object.entries(value)) {
      keys.push(key);
      visit(item);
    }
  };
  visit(payload);
  return keys;
}

export function replaceStrings(payload: unknown, replace: (text: string) => string): unknown {
  const visit = (value: unknown): unknown => {
    if (typeof value === "string") return replace(value);
    if (Array.isArray(value)) return value.map(visit);
    if (!isNode(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [replace(key), visit(item)]));
  };
  return visit(payload);
}

function isNode(value: unknown): value is Node {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}
