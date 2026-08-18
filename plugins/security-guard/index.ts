import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getString, getToolInput, normalizeToolName } from "./lib/events.ts";
import {
  createdTemporaryDirectoryFromCommand,
  evaluateText,
  isDestructiveText,
  removedTrackedTemporaryDirectories,
} from "./lib/policy.ts";
import {
  evaluateCommandSafety,
  formatSafetyAssessment,
  SAFETY_EVALUATION_CANCELLED_REASON,
  SAFETY_EVALUATION_WORKING_MESSAGE,
} from "./lib/safety-assessment.ts";
import { createTemporaryDirectoryTracker } from "./lib/temp-dirs.ts";
import {
  BLOCK_REASON,
  DESTRUCTIVE_APPROVAL_REASON,
  type ToolCallEvent,
  type ToolResultEvent,
  type UserBashEvent,
} from "./lib/types.ts";

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

function getToolResultText(event: ToolResultEvent): string {
  return (event.content ?? [])
    .filter((content) => content.type === "text" && typeof content.text === "string")
    .map((content) => content.text)
    .join("\n");
}

export default function securityGuard(pi: ExtensionAPI) {
  const temporaryDirectories = createTemporaryDirectoryTracker();

  pi.on("tool_call", async (event, ctx) => {
    const toolEvent = event as ToolCallEvent;
    const reason = getBlockReasonForToolCall(toolEvent);
    if (reason) return { block: true, reason };

    const command = getBashCommand(toolEvent);
    if (!isDestructiveText(command)) return undefined;

    const removed = removedTrackedTemporaryDirectories(command, temporaryDirectories);
    if (removed && (await temporaryDirectories.consume(removed))) return undefined;

    if (!ctx.hasUI) return { block: true, reason: DESTRUCTIVE_APPROVAL_REASON };

    // Evaluated per tool call: no assessment or approval is ever reused across calls.
    ctx.ui.setWorkingMessage(SAFETY_EVALUATION_WORKING_MESSAGE);
    let evaluation;
    try {
      evaluation = await evaluateCommandSafety({
        command,
        workingDirectory: ctx.cwd,
        registry: ctx.modelRegistry,
        signal: ctx.signal,
      });
    } finally {
      ctx.ui.setWorkingMessage();
    }
    if (!evaluation.ok) return { block: true, reason: evaluation.reason };
    if (ctx.signal?.aborted) return { block: true, reason: SAFETY_EVALUATION_CANCELLED_REASON };

    // Pi already rendered the pending bash tool call with the command, so the dialog shows only the
    // transient assessment; it is never appended to the session. The active turn signal dismisses
    // the dialog, and an abort at any point before execution ends in the blocked state.
    const approved = await ctx.ui.confirm("Approve destructive command?", formatSafetyAssessment(evaluation.assessment), {
      signal: ctx.signal,
    });
    if (ctx.signal?.aborted) return { block: true, reason: SAFETY_EVALUATION_CANCELLED_REASON };
    if (!approved) return { block: true, reason: DESTRUCTIVE_APPROVAL_REASON };

    return undefined;
  });

  pi.on("tool_result", async (event) => {
    const toolEvent = event as ToolResultEvent;
    // Hosts that omit isError on success must still track; the identity check in track() is the real gate.
    if (normalizeToolName(toolEvent.toolName) !== "bash" || toolEvent.isError === true) return;

    const path = createdTemporaryDirectoryFromCommand(getBashCommand(toolEvent), getToolResultText(toolEvent));
    if (path) await temporaryDirectories.track(path);
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

export {
  BLOCK_REASON,
  createdTemporaryDirectoryFromCommand,
  DESTRUCTIVE_APPROVAL_REASON,
  evaluateText,
  isBlockedText,
  isDestructiveText,
  removedTrackedTemporaryDirectories,
} from "./lib/policy.ts";
export {
  evaluateCommandSafety,
  formatSafetyAssessment,
  MAX_ASSESSMENT_FIELD_LENGTH,
  parseSafetyAssessment,
  SAFETY_EVALUATION_BLOCK_PREFIX,
  SAFETY_EVALUATION_CANCELLED_REASON,
  SAFETY_EVALUATION_TIMEOUT_MS,
  SAFETY_EVALUATION_WORKING_MESSAGE,
  SAFETY_EVALUATOR_MODEL_ID,
  SAFETY_EVALUATOR_PROVIDER,
  type SafetyAssessment,
  type SafetyEvaluation,
  type SafetyEvaluationRequest,
  type SafetyEvaluatorRegistry,
  type SafetyVerdict,
} from "./lib/safety-assessment.ts";
export { createTemporaryDirectoryTracker } from "./lib/temp-dirs.ts";
