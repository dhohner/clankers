import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { CutRedactor, RedactionEngine } from "../../application/redaction-engine.ts";
import { redactContentBlocks } from "./message-redaction.ts";
import { cutPositionsIn, reportsTruncation } from "./truncation-cuts.ts";
import { WITHHELD_TOOL_OUTPUT } from "./withheld.ts";

/** Skip cut redaction for wrapped tools because surviving prefixes were already checked and are unrelated text. */
const REDACTED_BEFORE_TRUNCATION = new Set(["bash", "read"]);

/**
 * Use `tool_result` to protect output from wrapped and unwrapped tools.
 * Preserve content block types, and treat text and details as data.
 * Clear failed details with an empty object because the runner treats `undefined` as unchanged.
 *
 * Unwrapped tools truncate before this event and may leave a credential prefix at a cut.
 * Redact text again at host cut positions because complete value redaction cannot reach that prefix.
 */
export function registerToolResultProtection(pi: ExtensionAPI, engine: RedactionEngine): void {
  pi.on("tool_result", (event) => {
    try {
      const truncated = reportsTruncation(event.details);
      const cutsApply = !REDACTED_BEFORE_TRUNCATION.has(event.toolName);
      return engine.redactWith((redactValue, redactCuts) => {
        const content = redactContentBlocks(event.content, redactValue);
        return {
          content: cutsApply ? redactCutText(content, redactCuts, truncated) : content,
          ...(event.details === undefined ? {} : { details: redactValue(event.details) }),
        };
      });
    } catch {
      return { content: [{ type: "text", text: WITHHELD_TOOL_OUTPUT }], details: {}, isError: true };
    }
  });
}

function redactCutText<T>(blocks: T[], redactCuts: CutRedactor, truncated: boolean): T[] {
  return blocks.map((block) => {
    const candidate = block as { type?: unknown; text?: unknown };
    if (candidate.type !== "text" || typeof candidate.text !== "string") return block;
    return { ...block, text: redactCuts(candidate.text, cutPositionsIn(candidate.text, truncated)) };
  });
}
