import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getString, getToolInput, normalizeToolName } from "./lib/events.ts";
import { evaluateText, isDestructiveText } from "./lib/policy.ts";
import { BLOCK_REASON, DESTRUCTIVE_APPROVAL_REASON, type ToolCallEvent, type UserBashEvent } from "./lib/types.ts";

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

function getBashCommand(event: ToolCallEvent): string {
  return normalizeToolName(event.toolName) === "bash" ? getString(getToolInput(event), ["command"]) : "";
}

export default function securityGuard(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    const toolEvent = event as ToolCallEvent;
    const reason = getBlockReasonForToolCall(toolEvent);
    if (reason) return { block: true, reason };

    const command = getBashCommand(toolEvent);
    if (!isDestructiveText(command)) return undefined;

    if (!ctx.hasUI) return { block: true, reason: DESTRUCTIVE_APPROVAL_REASON };

    const approved = await ctx.ui.confirm("Approve destructive command?", command);
    if (!approved) return { block: true, reason: DESTRUCTIVE_APPROVAL_REASON };

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

export { BLOCK_REASON, DESTRUCTIVE_APPROVAL_REASON, evaluateText, isBlockedText, isDestructiveText } from "./lib/policy.ts";
