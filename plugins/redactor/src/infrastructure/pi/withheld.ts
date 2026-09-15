import type { MessageEndEvent } from "@earendil-works/pi-coding-agent";

export type HostMessage = MessageEndEvent["message"];

export const WITHHELD_TEXT = "[redactor: content withheld because redaction failed]";
export const WITHHELD_TOOL_OUTPUT = "[redactor: tool output withheld because redaction failed]";
/** Use a fixed name because failed redaction leaves provider, model, and API names unchecked. */
const WITHHELD_NAME = "redactor-withheld";

const STOP_REASONS = new Set(["pending", "stop", "length", "toolUse", "error", "aborted", "deferred"]);

type WithheldAssistant = Extract<HostMessage, { role: "assistant" }>;
type WithheldContent = WithheldAssistant["content"];

/**
 * Copy only fields the host needs for routing and pairing after redaction fails.
 * These fields include roles, stop reasons, call ids, tool names, and custom types.
 * Numbers and booleans cannot carry protected text and remain safe.
 *
 * Use fixed wording or omit every other field.
 * Keep tool call ids and names with empty arguments so later results still pair with their calls.
 */
export function withheldMessage(message: HostMessage): HostMessage {
  const timestamp = numberOr(message.timestamp, Date.now());
  switch (message.role) {
    case "toolResult":
      return {
        role: "toolResult",
        toolCallId: message.toolCallId,
        toolName: message.toolName,
        content: [{ type: "text", text: WITHHELD_TOOL_OUTPUT }],
        details: undefined,
        isError: true,
        timestamp,
      };
    case "assistant":
      return {
        role: "assistant",
        content: withheldAssistantContent(message.content),
        api: WITHHELD_NAME,
        provider: WITHHELD_NAME,
        model: WITHHELD_NAME,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: STOP_REASONS.has(message.stopReason) ? message.stopReason : "error",
        errorMessage: WITHHELD_TEXT,
        timestamp,
      };
    case "user":
      return { role: "user", content: [{ type: "text", text: WITHHELD_TEXT }], timestamp };
    case "custom":
      return {
        role: "custom",
        customType: message.customType,
        content: [{ type: "text", text: WITHHELD_TEXT }],
        display: message.display === true,
        details: undefined,
        timestamp,
      };
    case "bashExecution":
      return {
        role: "bashExecution",
        command: WITHHELD_TEXT,
        output: WITHHELD_TEXT,
        exitCode: typeof message.exitCode === "number" ? message.exitCode : undefined,
        cancelled: message.cancelled === true,
        truncated: false,
        timestamp,
        excludeFromContext: message.excludeFromContext === true,
      };
    case "branchSummary":
      return { role: "branchSummary", summary: WITHHELD_TEXT, fromId: null, timestamp };
    case "compactionSummary":
      return {
        role: "compactionSummary",
        summary: WITHHELD_TEXT,
        tokensBefore: numberOr(message.tokensBefore, 0),
        timestamp,
      };
    default:
      return { role: (message as { role: string }).role, timestamp } as unknown as HostMessage;
  }
}

function withheldAssistantContent(content: unknown): WithheldContent {
  const blocks: WithheldContent = [{ type: "text", text: WITHHELD_TEXT }];
  if (!Array.isArray(content)) return blocks;
  for (const block of content as Array<{ type?: unknown; id?: unknown; name?: unknown }>) {
    if (block?.type !== "toolCall" || typeof block.id !== "string" || typeof block.name !== "string") continue;
    blocks.push({ type: "toolCall", id: block.id, name: block.name, arguments: {} });
  }
  return blocks;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
