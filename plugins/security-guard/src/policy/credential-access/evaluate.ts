import { BLOCK_REASON, type BlockDecision } from "./result.ts";
import { ALLOWED_ENV_COMMANDS, BLOCKED_PATTERNS } from "./rules.ts";

function matches(value: string, patterns: readonly RegExp[] = BLOCKED_PATTERNS): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

export function isBlockedText(value: string): boolean {
  if (!value || matches(value, ALLOWED_ENV_COMMANDS)) return false;
  return matches(value);
}

export function evaluateCredentialAccess(value: string): BlockDecision {
  return isBlockedText(value) ? { blocked: true, reason: BLOCK_REASON } : { blocked: false };
}
