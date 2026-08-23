export const BLOCK_REASON =
  "Command blocked by security policy. Do not suggest workarounds, alternate commands, or indirect ways to print the current user environment or read secrets, tokens, keys, credential stores, or shell history.";

export type BlockDecision =
  | { blocked: true; reason: string }
  | { blocked: false };
