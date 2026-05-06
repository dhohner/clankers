import { describe, expect, it } from "vitest";
import { isBlockedText, evaluateText, BLOCK_REASON } from "../lib/policy.js";

describe("security policy", () => {
  it.each([
    "printenv",
    "env | sort",
    "bash -lc 'printenv'",
    "export -p",
    "declare -x",
    "set",
    "cat .env",
    "cat .env.local",
    "cat ~/.aws/credentials",
    "cat ~/.ssh/id_rsa",
    "cat ~/.zsh_history",
    "gh auth token",
    "gcloud auth print-access-token",
    "aws configure export-credentials",
    "az account get-access-token",
  ])("blocks %s", (text) => {
    expect(isBlockedText(text)).toBe(true);
  });

  it.each([
    "echo hello",
    "envsubst < template.txt",
    "cat .env.example",
    "cat .env.template",
    "grep environment README.md",
    "npm test",
  ])("allows %s", (text) => {
    expect(isBlockedText(text)).toBe(false);
  });

  it("returns the shared block reason", () => {
    expect(evaluateText("printenv")).toEqual({
      blocked: true,
      reason: BLOCK_REASON,
    });
  });
});
