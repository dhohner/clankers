import { evaluateCredentialAccess } from "../policy/credential-access/evaluate.ts";

export type UserBashDecision = { kind: "allow" } | { kind: "block"; reason: string };

export function decideUserBash(command: string): UserBashDecision {
  const decision = evaluateCredentialAccess(command);
  return decision.blocked
    ? { kind: "block", reason: decision.reason }
    : { kind: "allow" };
}
