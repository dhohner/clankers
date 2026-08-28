import type { ProvableCall, ProofFailure } from "../../proof/types.ts";
import type { UnsupportedShellSyntax } from "../../shell/tokenizer.ts";

export const DESTRUCTIVE_APPROVAL_REASON = "Destructive command blocked because it was not approved by the user.";

/**
 * A question about one operand that only the host can answer, relative to the working directory. `absent`
 * is what a `git checkout` operand must be for Git to read it as a branch or commit; `directory` is what the
 * last `mv` operand must be for the others to move into it.
 */
export type HostPathCheck = { path: string; expectation: "absent" | "directory" };

export type ApprovalRequirement =
  | { kind: "unsupported-syntax"; detail: UnsupportedShellSyntax }
  | { kind: "unprovable-effects"; detail: ProofFailure }
  | {
      kind: "temporary-cleanup-verification";
      detail:
        | "executable-resolution-failed"
        | "temporary-path-verification-failed"
        | "regenerable-path-verification-failed"
        | "host-verification-error";
      cause?: string;
    }
  | {
      kind: "host-path-check";
      detail: "executable-resolution-failed" | "path-exists" | "path-is-not-a-directory" | "host-verification-error";
      cause?: string;
    };

export type CommandAnalysisResult =
  | { kind: "notDestructive" }
  | { kind: "approvalRequired"; reason: ApprovalRequirement }
  | { kind: "temporaryCleanup"; proof: ProvableCall }
  /** `commands` are the bare command words the host must resolve to system executables, as in a proof. */
  | { kind: "hostPathCheck"; checks: HostPathCheck[]; commands: string[] };
