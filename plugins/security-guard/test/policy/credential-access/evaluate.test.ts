import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateCredentialAccess, isBlockedText } from "../../../src/policy/credential-access/evaluate.js";
import { BLOCK_REASON } from "../../../src/policy/credential-access/result.js";

const blockedTextCases: Array<{ command: string; blocked: boolean }> = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../fixtures/blocked-text-cases.json"), "utf8"),
);

describe("blocked-text policy", () => {
  it.each(blockedTextCases)("blocked=$blocked for $command", ({ command, blocked }) => {
    expect(isBlockedText(command)).toBe(blocked);
  });

  it("returns the shared block reason", () => {
    expect(evaluateCredentialAccess("printenv")).toEqual({
      blocked: true,
      reason: BLOCK_REASON,
    });
  });
});
