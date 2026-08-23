import { proveShellEffects } from "../../proof/provable-call.ts";
import { classifyShellAst } from "./commands/classify-command.ts";
import { parseShell } from "../../shell/parse.ts";
import type { CommandAnalysisResult } from "./result.ts";

/** Parses, classifies, and proves one command text through one retained shell AST. */
export function analyzeCommand(command: string): CommandAnalysisResult {
  const parsed = parseShell(command);
  if (parsed.kind === "unsupported") {
    return {
      kind: "approvalRequired",
      reason: { kind: "unsupported-syntax", detail: parsed.reason },
    };
  }

  const classification = classifyShellAst(parsed.ast);
  if (!classification.destructive) return { kind: "notDestructive" };

  const proof = proveShellEffects(parsed.ast, classification.destructiveStarts);
  if (proof.kind === "unprovable") {
    return {
      kind: "approvalRequired",
      reason: { kind: "unprovable-effects", detail: proof.reason },
    };
  }
  if (proof.value.targets.length === 0) {
    return {
      kind: "approvalRequired",
      reason: { kind: "unprovable-effects", detail: "destructive command is approval-only" },
    };
  }
  return { kind: "temporaryCleanup", proof: proof.value };
}
