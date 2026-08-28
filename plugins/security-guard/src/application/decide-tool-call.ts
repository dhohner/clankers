import { SAFETY_EVALUATION_CANCELLED_REASON } from "../policy/assessment/assessment-codec.ts";
import { analyzeCommand } from "../policy/command-analysis/analyze-command.ts";
import {
  DESTRUCTIVE_APPROVAL_REASON,
  type ApprovalRequirement,
  type HostPathCheck,
} from "../policy/command-analysis/result.ts";
import { evaluateCredentialAccess } from "../policy/credential-access/evaluate.ts";
import type { DecisionPorts } from "./ports.ts";

export type ToolCall = { kind: "bash"; command: string } | { kind: "read"; path: string } | { kind: "other" };

export type ToolCallDecision = { kind: "allow" } | { kind: "block"; reason: string; analysis?: ApprovalRequirement };

export type ToolCallDecisionRequest = {
  call: ToolCall;
  workingDirectory: string;
  approvalAvailable: boolean;
  signal?: AbortSignal;
};

type HostVerification = { verified: true } | { verified: false; reason: ApprovalRequirement };

function errorCause(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function verifyTemporaryCleanup(
  analysis: Extract<ReturnType<typeof analyzeCommand>, { kind: "temporaryCleanup" }>,
  request: ToolCallDecisionRequest,
  ports: DecisionPorts,
): Promise<HostVerification> {
  try {
    const [executablesMatch, pathsAreTemporary] = await Promise.all([
      ports.resolveExecutables(analysis.proof.commands, request.workingDirectory),
      ports.verifyTemporaryPaths(analysis.proof.targets, request.workingDirectory),
    ]);
    if (!executablesMatch) {
      return {
        verified: false,
        reason: { kind: "temporary-cleanup-verification", detail: "executable-resolution-failed" },
      };
    }
    if (!pathsAreTemporary) {
      return {
        verified: false,
        reason: { kind: "temporary-cleanup-verification", detail: "temporary-path-verification-failed" },
      };
    }
    return { verified: true };
  } catch (error) {
    return {
      verified: false,
      reason: {
        kind: "temporary-cleanup-verification",
        detail: "host-verification-error",
        cause: errorCause(error),
      },
    };
  }
}

function failedHostPathCheck(check: HostPathCheck): ApprovalRequirement {
  return {
    kind: "host-path-check",
    detail: check.expectation === "absent" ? "path-exists" : "path-is-not-a-directory",
  };
}

/**
 * Asks the host each question the analysis could not settle. The command words have to resolve to system
 * executables, as for a cleanup proof, and every check has to hold; an answer other than the expected one,
 * a rejected or thrown inspection, and a working directory the request does not carry all fail closed.
 */
async function verifyHostPaths(
  analysis: Extract<ReturnType<typeof analyzeCommand>, { kind: "hostPathCheck" }>,
  request: ToolCallDecisionRequest,
  ports: DecisionPorts,
): Promise<HostVerification> {
  const { checks, commands } = analysis;
  if (request.workingDirectory === "") {
    return {
      verified: false,
      reason: { kind: "host-path-check", detail: "host-verification-error", cause: "working directory is unknown" },
    };
  }
  try {
    const [executablesMatch, presences] = await Promise.all([
      ports.resolveExecutables(commands, request.workingDirectory),
      Promise.all(checks.map((check) => ports.inspectPath(check.path, request.workingDirectory))),
    ]);
    if (!executablesMatch) {
      return { verified: false, reason: { kind: "host-path-check", detail: "executable-resolution-failed" } };
    }
    for (const [index, check] of checks.entries()) {
      if (presences[index] !== check.expectation) return { verified: false, reason: failedHostPathCheck(check) };
    }
    return { verified: true };
  } catch (error) {
    return {
      verified: false,
      reason: { kind: "host-path-check", detail: "host-verification-error", cause: errorCause(error) },
    };
  }
}

/** Applies host-neutral credential, command, proof, assessment, and approval policy for one tool call. */
export async function decideToolCall(
  request: ToolCallDecisionRequest,
  ports: DecisionPorts,
): Promise<ToolCallDecision> {
  if (request.call.kind === "other") return { kind: "allow" };

  const text = request.call.kind === "bash" ? request.call.command : request.call.path;
  const credentialDecision = evaluateCredentialAccess(text);
  if (credentialDecision.blocked) return { kind: "block", reason: credentialDecision.reason };
  if (request.call.kind !== "bash") return { kind: "allow" };

  const analysis = analyzeCommand(request.call.command);
  if (analysis.kind === "notDestructive") return { kind: "allow" };

  let analysisReason: ApprovalRequirement;
  if (analysis.kind === "temporaryCleanup") {
    const verification = await verifyTemporaryCleanup(analysis, request, ports);
    if (verification.verified) return { kind: "allow" };
    analysisReason = verification.reason;
  } else if (analysis.kind === "hostPathCheck") {
    const verification = await verifyHostPaths(analysis, request, ports);
    if (verification.verified) return { kind: "allow" };
    analysisReason = verification.reason;
  } else {
    analysisReason = analysis.reason;
  }
  if (!request.approvalAvailable) {
    return { kind: "block", reason: DESTRUCTIVE_APPROVAL_REASON, analysis: analysisReason };
  }

  const evaluation = await ports.assessCommand({
    command: request.call.command,
    workingDirectory: request.workingDirectory,
    signal: request.signal,
  });
  if (!evaluation.ok) return { kind: "block", reason: evaluation.reason, analysis: analysisReason };
  if (request.signal?.aborted) {
    return { kind: "block", reason: SAFETY_EVALUATION_CANCELLED_REASON, analysis: analysisReason };
  }

  const approved = await ports.requestApproval({ assessment: evaluation.assessment, signal: request.signal });
  if (request.signal?.aborted) {
    return { kind: "block", reason: SAFETY_EVALUATION_CANCELLED_REASON, analysis: analysisReason };
  }
  return approved
    ? { kind: "allow" }
    : { kind: "block", reason: DESTRUCTIVE_APPROVAL_REASON, analysis: analysisReason };
}
