import type { DeepRedactor } from "../../application/redaction-engine.ts";
import { redactByShape } from "../../domain/structured-redaction.ts";
import { HOST_CONTENT_BLOCKS, HOST_MESSAGE } from "./provider-shapes.ts";
import type { HostMessage } from "./withheld.ts";

/**
 * Preserve roles because `message_end` rejects replacements with changed roles.
 * Preserve `stopReason` and block types because the agent loop dispatches on them.
 *
 * Preserve tool call ids and names because they pair calls with results.
 * Treat every other field and nested property name as data.
 */
export function redactMessage(message: HostMessage, redactValue: DeepRedactor): HostMessage {
  return redactByShape(message, HOST_MESSAGE, (value) => redactValue(value));
}

export function redactContentBlocks<T>(blocks: readonly T[], redactValue: DeepRedactor): T[] {
  return redactByShape([...blocks], HOST_CONTENT_BLOCKS, (value) => redactValue(value));
}
