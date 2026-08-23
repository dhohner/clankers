import type {
  ExtensionContext,
  ToolCallEvent,
  UserBashEvent,
} from "@earendil-works/pi-coding-agent";
import { decideToolCall, type ToolCall } from "../../application/decide-tool-call.ts";
import { decideUserBash } from "../../application/decide-user-bash.ts";
import { formatSafetyAssessment } from "../../policy/assessment/assessment-codec.ts";
import { BLOCK_REASON } from "../../policy/credential-access/result.ts";
import { allSystemExecutables as verifySystemExecutables } from "../node/executable-resolver.ts";
import { allInsideTemporaryRoot as verifyTemporaryPaths } from "../node/temporary-root.ts";
import {
  evaluateCommandSafety,
  SAFETY_EVALUATION_WORKING_MESSAGE,
} from "./model-assessor.ts";

function inputRecord(event: ToolCallEvent): Record<string, unknown> {
  const compatible = event as ToolCallEvent & { args?: Record<string, unknown> };
  return (compatible.input as Record<string, unknown> | undefined) ?? compatible.args ?? {};
}

function firstString(input: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string") return value;
  }
  return "";
}

export function translatePiToolCall(event: ToolCallEvent): ToolCall {
  const toolName = event.toolName.toLowerCase();
  const input = inputRecord(event);
  if (toolName === "bash") return { kind: "bash", command: firstString(input, ["command"]) };
  if (toolName === "read") return { kind: "read", path: firstString(input, ["path", "file", "filePath"]) };
  return { kind: "other" };
}

export async function handlePiToolCall(event: ToolCallEvent, ctx: ExtensionContext) {
  const context = ctx as ExtensionContext | undefined;
  const decision = await decideToolCall(
    {
      call: translatePiToolCall(event),
      workingDirectory: context?.cwd ?? "",
      approvalAvailable: context?.hasUI ?? false,
      signal: context?.signal,
    },
    {
      resolveExecutables: verifySystemExecutables,
      verifyTemporaryPaths,
      assessCommand: async ({ command, workingDirectory, signal }) => {
        if (!context) throw new Error("Pi did not provide an extension context");
        context.ui.setWorkingMessage(SAFETY_EVALUATION_WORKING_MESSAGE);
        try {
          return await evaluateCommandSafety({
            command,
            workingDirectory,
            registry: context.modelRegistry,
            signal,
          });
        } finally {
          context.ui.setWorkingMessage();
        }
      },
      requestApproval: ({ assessment, signal }) => {
        if (!context) throw new Error("Pi did not provide an extension context");
        return context.ui.confirm(
          "Approve destructive command?",
          formatSafetyAssessment(assessment),
          { signal },
        );
      },
    },
  );
  return decision.kind === "block" ? { block: true as const, reason: decision.reason } : undefined;
}

export function handlePiUserBash(event: UserBashEvent) {
  if (decideUserBash(event.command ?? "").kind === "allow") return undefined;
  return {
    result: {
      output: BLOCK_REASON,
      exitCode: 2,
      cancelled: false,
      truncated: false,
    },
  };
}
