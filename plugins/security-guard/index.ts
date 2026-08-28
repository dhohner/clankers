import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { handlePiToolCall, handlePiUserBash } from "./src/infrastructure/pi/events.ts";

export default function securityGuard(pi: ExtensionAPI) {
  pi.on("tool_call", handlePiToolCall);
  pi.on("user_bash", handlePiUserBash);
}

export {
  analyzeCommand,
  allInsideTemporaryRoot,
  allSystemExecutables,
  BLOCK_REASON,
  DESTRUCTIVE_APPROVAL_REASON,
  destructiveTargets,
  evaluateCommandSafety,
  evaluateText,
  formatSafetyAssessment,
  inheritedShellStartupIsInert,
  inspectPath,
  isBlockedText,
  isDestructiveText,
  isInsideTemporaryRoot,
  MAX_ASSESSMENT_FIELD_LENGTH,
  parseSafetyAssessment,
  provableCall,
  resolvesToSystemExecutable,
  SAFETY_EVALUATION_BLOCK_PREFIX,
  SAFETY_EVALUATION_CANCELLED_REASON,
  SAFETY_EVALUATION_TIMEOUT_MS,
  SAFETY_EVALUATION_WORKING_MESSAGE,
  SAFETY_EVALUATOR_MODEL_ID,
  SAFETY_EVALUATOR_PROVIDER,
  SAFETY_EVALUATOR_PROVIDERS,
  type ApprovalRequirement,
  type CommandAnalysisResult,
  type DestructiveTarget,
  type HostPathCheck,
  type PathPresence,
  type ProvableCall,
  type SafetyAssessment,
  type SafetyEvaluation,
  type SafetyEvaluationRequest,
  type SafetyEvaluatorRegistry,
  type SafetyVerdict,
} from "./src/public.ts";
