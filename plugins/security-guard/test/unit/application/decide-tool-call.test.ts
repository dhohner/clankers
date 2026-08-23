import { describe, expect, it, vi } from "vitest";
import { decideToolCall } from "../../../src/application/decide-tool-call.js";
import type { DecisionPorts } from "../../../src/application/ports.js";
import { BLOCK_REASON } from "../../../src/policy/credential-access/result.js";
import { DESTRUCTIVE_APPROVAL_REASON } from "../../../src/policy/command-analysis/result.js";

function makePorts(overrides: Partial<DecisionPorts> = {}): DecisionPorts {
  return {
    resolveExecutables: vi.fn().mockResolvedValue(true),
    verifyTemporaryPaths: vi.fn().mockResolvedValue(true),
    assessCommand: vi.fn().mockResolvedValue({
      ok: true,
      assessment: { verdict: "safe", intent: "Removes a file", reason: "The target is temporary" },
    }),
    requestApproval: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

const request = (command: string, approvalAvailable = true) => ({
  call: { kind: "bash" as const, command },
  workingDirectory: "/tmp/work",
  approvalAvailable,
});

describe("decideToolCall", () => {
  it("blocks credential access before command analysis ports run", async () => {
    const ports = makePorts();
    await expect(decideToolCall(request("cat .env"), ports)).resolves.toEqual({
      kind: "block",
      reason: BLOCK_REASON,
    });
    expect(ports.resolveExecutables).not.toHaveBeenCalled();
    expect(ports.assessCommand).not.toHaveBeenCalled();
  });

  it("allows non-destructive commands without invoking a port", async () => {
    const ports = makePorts();
    await expect(decideToolCall(request("ls -la"), ports)).resolves.toEqual({ kind: "allow" });
    expect(ports.resolveExecutables).not.toHaveBeenCalled();
    expect(ports.assessCommand).not.toHaveBeenCalled();
  });

  it("allows a cleanup only after both host proofs pass", async () => {
    const ports = makePorts();
    await expect(decideToolCall(request("rm -rf build"), ports)).resolves.toEqual({ kind: "allow" });
    expect(ports.resolveExecutables).toHaveBeenCalledWith(["rm"], "/tmp/work");
    expect(ports.verifyTemporaryPaths).toHaveBeenCalledOnce();
    expect(ports.assessCommand).not.toHaveBeenCalled();
  });

  it("assesses and requests approval when a host proof fails", async () => {
    const ports = makePorts({ verifyTemporaryPaths: vi.fn().mockResolvedValue(false) });
    await expect(decideToolCall(request("rm -rf build"), ports)).resolves.toEqual({ kind: "allow" });
    expect(ports.assessCommand).toHaveBeenCalledOnce();
    expect(ports.requestApproval).toHaveBeenCalledOnce();
  });

  it("blocks without assessment when approval is unavailable", async () => {
    const ports = makePorts({ verifyTemporaryPaths: vi.fn().mockResolvedValue(false) });
    await expect(decideToolCall(request("rm -rf build", false), ports)).resolves.toEqual({
      kind: "block",
      reason: DESTRUCTIVE_APPROVAL_REASON,
      analysis: {
        kind: "temporary-cleanup-verification",
        detail: "temporary-path-verification-failed",
      },
    });
    expect(ports.assessCommand).not.toHaveBeenCalled();
  });

  it("preserves host verification errors while failing closed", async () => {
    const ports = makePorts({ resolveExecutables: vi.fn().mockRejectedValue(new Error("resolver unavailable")) });
    await expect(decideToolCall(request("rm -rf build", false), ports)).resolves.toEqual({
      kind: "block",
      reason: DESTRUCTIVE_APPROVAL_REASON,
      analysis: {
        kind: "temporary-cleanup-verification",
        detail: "host-verification-error",
        cause: "resolver unavailable",
      },
    });
  });

  it("preserves an unsupported syntax reason on a denied decision", async () => {
    const ports = makePorts();
    await expect(decideToolCall(request("echo $((1 + 1))", false), ports)).resolves.toEqual({
      kind: "block",
      reason: DESTRUCTIVE_APPROVAL_REASON,
      analysis: { kind: "unsupported-syntax", detail: "arithmetic" },
    });
  });
});
