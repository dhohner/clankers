import type { ProvableCall, ProofFailure } from "../../proof/types.ts";
import type { UnsupportedShellSyntax } from "../../shell/tokenizer.ts";

export const DESTRUCTIVE_APPROVAL_REASON = "Destructive command blocked because it was not approved by the user.";

export type ApprovalRequirement =
  | { kind: "unsupported-syntax"; detail: UnsupportedShellSyntax }
  | { kind: "unprovable-effects"; detail: ProofFailure }
  | {
      kind: "temporary-cleanup-verification";
      detail: "executable-resolution-failed" | "temporary-path-verification-failed" | "host-verification-error";
      cause?: string;
    };

export type CommandAnalysisResult =
  | { kind: "notDestructive" }
  | { kind: "approvalRequired"; reason: ApprovalRequirement }
  | { kind: "temporaryCleanup"; proof: ProvableCall };
