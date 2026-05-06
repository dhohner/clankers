import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getString, getToolInput, normalizeToolName } from "./lib/events.ts";
import { evaluateText } from "./lib/policy.ts";
import { BLOCK_REASON, type ToolCallEvent, type UserBashEvent } from "./lib/types.ts";

const TOOL_INPUT_KEYS: Readonly<Record<string, readonly string[]>> = {
  bash: ["command"],
  read: ["path", "file", "filePath"],
};

function getBlockReasonForToolCall(event: ToolCallEvent): string | undefined {
  const toolName = normalizeToolName(event.toolName);
  const keys = TOOL_INPUT_KEYS[toolName];
  if (!keys) return undefined;

  const decision = evaluateText(getString(getToolInput(event), keys));
  return decision.blocked ? decision.reason : undefined;
}

export default function securityGuard(pi: ExtensionAPI) {
  pi.on("tool_call", async (event) => {
    const reason = getBlockReasonForToolCall(event as ToolCallEvent);
    if (reason) return { block: true, reason };

    return undefined;
  });

  pi.on("user_bash", async (event) => {
    const command = (event as UserBashEvent).command ?? "";
    const decision = evaluateText(command);
    if (!decision.blocked) return undefined;

    return {
      result: {
        output: BLOCK_REASON,
        exitCode: 2,
        cancelled: false,
        truncated: false,
      },
    };
  });
}

export { BLOCK_REASON, evaluateText, isBlockedText } from "./lib/policy.ts";
