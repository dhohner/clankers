import { describe, expect, it } from "vitest";
import { extractPathOperands, extractPathTargets } from "../src/proof/path-operands.js";
import type { ShellState } from "../src/proof/types.js";
import { shellTokens } from "../src/shell/tokenizer.js";

const emptyState: ShellState = { variables: new Map(), errexit: false };

describe("path operand extraction", () => {
  it("keeps mv's target-directory option as a path", () => {
    const result = extractPathOperands("mv", shellTokens("-t out a b"));

    expect(result.kind).toBe("proven");
    if (result.kind !== "proven") return;
    expect(result.value.map((word) => word.text)).toEqual(["out", "a", "b"]);
  });

  it("fails closed for an unknown command option", () => {
    expect(extractPathOperands("rm", shellTokens("--unknown build"))).toEqual({
      kind: "unprovable",
      reason: "path operands cannot be identified",
    });
  });

  it("marks truncate targets as following symlinks", () => {
    expect(extractPathTargets("truncate", shellTokens("-s 0 log.txt"), emptyState)).toEqual({
      kind: "proven",
      value: [{ path: "log.txt", insideMktempDirectory: false, followsLinks: true }],
    });
  });
});
