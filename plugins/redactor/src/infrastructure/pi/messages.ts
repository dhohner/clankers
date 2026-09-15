import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RedactionEngine } from "../../application/redaction-engine.ts";
import { redactMessage } from "./message-redaction.ts";
import { type HostMessage, withheldMessage } from "./withheld.ts";

export function protectMessage(engine: RedactionEngine, message: HostMessage): HostMessage {
  try {
    return engine.redactWith((redactValue) => redactMessage(message, redactValue));
  } catch {
    return withheldMessage(message);
  }
}

/**
 * `message_end` runs before `AgentSession` persists the final message.
 * The host replaces that message in place, so state, listeners, and the session file receive the redacted copy.
 */
export function registerFinalizedMessageProtection(pi: ExtensionAPI, engine: RedactionEngine): void {
  pi.on("message_end", (event) => ({ message: protectMessage(engine, event.message) }));
}

/**
 * Redact all messages in one pass to build the value index once per model call.
 * After a batch failure, protect messages separately so one failure does not withhold the others.
 */
export function protectMessages(engine: RedactionEngine, messages: readonly HostMessage[]): HostMessage[] {
  try {
    return engine.redactWith((redactValue) => messages.map((message) => redactMessage(message, redactValue)));
  } catch {
    return messages.map((message) => protectMessage(engine, message));
  }
}

export function registerContextProtection(pi: ExtensionAPI, engine: RedactionEngine): void {
  pi.on("context", (event) => ({ messages: protectMessages(engine, event.messages) }));
}
