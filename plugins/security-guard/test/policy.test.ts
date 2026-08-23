import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BLOCK_REASON, evaluateText, isBlockedText } from "../src/public.js";

// Shared with test/security-guard.bats so the TypeScript policy and scripts/block-fups.sh,
// which reimplement the same patterns for different hosts, cannot drift apart unnoticed.
const blockedTextCases: Array<{ command: string; blocked: boolean }> = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures/blocked-text-cases.json"), "utf8"),
);

describe("blocked-text policy", () => {
  it.each(blockedTextCases)("blocked=$blocked for $command", ({ command, blocked }) => {
    expect(isBlockedText(command)).toBe(blocked);
  });

  it("returns the shared block reason", () => {
    expect(evaluateText("printenv")).toEqual({
      blocked: true,
      reason: BLOCK_REASON,
    });
  });
});
