export { analyzeCommand } from "./policy/command-analysis/analyze-command.ts";
export {
  COMMAND_RULES,
  commandRule,
  registeredCommandAliases,
  type CommandRule,
  type EffectModel,
  type SymlinkBehavior,
} from "./policy/command-analysis/command-registry.ts";
export {
  DESTRUCTIVE_APPROVAL_REASON,
  type ApprovalRequirement,
  type CommandAnalysisResult,
  type HostPathCheck,
} from "./policy/command-analysis/result.ts";
export {
  formatSafetyAssessment,
  MAX_ASSESSMENT_FIELD_LENGTH,
  parseSafetyAssessment,
  SAFETY_EVALUATION_BLOCK_PREFIX,
  SAFETY_EVALUATION_CANCELLED_REASON,
  type SafetyAssessment,
  type SafetyEvaluation,
  type SafetyVerdict,
} from "./policy/assessment/assessment-codec.ts";
export {
  evaluateCredentialAccess as evaluateText,
  isBlockedText,
  matches,
} from "./policy/credential-access/evaluate.ts";
export { BLOCKED_PATTERNS } from "./policy/credential-access/rules.ts";
export { BLOCK_REASON } from "./policy/credential-access/result.ts";
export {
  evaluateCommandSafety,
  SAFETY_EVALUATION_TIMEOUT_MS,
  SAFETY_EVALUATION_WORKING_MESSAGE,
  SAFETY_EVALUATOR_MODEL_ID,
  SAFETY_EVALUATOR_PROVIDER,
  SAFETY_EVALUATOR_PROVIDERS,
  type SafetyEvaluationRequest,
  type SafetyEvaluatorRegistry,
} from "./infrastructure/pi/model-assessor.ts";
export {
  allSystemExecutables,
  inheritedShellStartupIsInert,
  resolvesToSystemExecutable,
} from "./infrastructure/node/executable-resolver.ts";
export { allInsideTemporaryRoot, isInsideTemporaryRoot } from "./infrastructure/node/temporary-root.ts";
export { inspectPath } from "./infrastructure/node/path-presence.ts";
export type { PathPresence } from "./application/ports.ts";
export { isDestructiveText } from "./policy/command-analysis/commands/classify-command.ts";
export { destructiveTargets, provableCall, type DestructiveTarget, type ProvableCall } from "./proof/provable-call.ts";
