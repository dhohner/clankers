import type { DestructiveTarget } from "../proof/types.ts";
import type { SafetyAssessment, SafetyEvaluation } from "../policy/assessment/assessment-codec.ts";

export type CommandAssessmentPort = (request: {
  command: string;
  workingDirectory: string;
  signal?: AbortSignal;
}) => Promise<SafetyEvaluation>;

export type CommandApprovalPort = (request: { assessment: SafetyAssessment; signal?: AbortSignal }) => Promise<boolean>;

export type ExecutableResolutionPort = (commandNames: readonly string[], workingDirectory: string) => Promise<boolean>;

export type TemporaryPathVerificationPort = (
  targets: readonly DestructiveTarget[],
  workingDirectory: string,
) => Promise<boolean>;

/** What a path resolved against the working directory names: nothing, a directory, or any other entry. */
export type PathPresence = "absent" | "directory" | "other";

/** Answers what `path`, resolved against `workingDirectory`, names. Rejects when it cannot tell. */
export type PathInspectionPort = (path: string, workingDirectory: string) => Promise<PathPresence>;

export type DecisionPorts = {
  assessCommand: CommandAssessmentPort;
  requestApproval: CommandApprovalPort;
  resolveExecutables: ExecutableResolutionPort;
  verifyTemporaryPaths: TemporaryPathVerificationPort;
  inspectPath: PathInspectionPort;
};
