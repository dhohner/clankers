import { describe, expect, it, vi } from "vitest";
import { decideToolCall } from "../../src/application/decide-tool-call.js";
import type { DecisionPorts } from "../../src/application/ports.js";
import { BLOCK_REASON } from "../../src/policy/credential-access/result.js";
import { DESTRUCTIVE_APPROVAL_REASON } from "../../src/policy/command-analysis/result.js";

function makePorts(overrides: Partial<DecisionPorts> = {}): DecisionPorts {
  return {
    resolveExecutables: vi.fn().mockResolvedValue(true),
    verifyTemporaryPaths: vi.fn().mockResolvedValue(true),
    verifyRegenerablePaths: vi.fn().mockResolvedValue(false),
    inspectPath: vi.fn().mockResolvedValue("absent"),
    assessCommand: vi.fn().mockResolvedValue({
      ok: true,
      assessment: { verdict: "safe", intent: "Removes a file", reason: "The target is temporary" },
    }),
    requestApproval: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

const request = (command: string, approvalAvailable = true, workingDirectory = "/tmp/work") => ({
  call: { kind: "bash" as const, command },
  workingDirectory,
  approvalAvailable,
});

/** A path inspection that answers from a fixed inventory and reports unlisted paths as absent. */
function inventory(entries: Record<string, "directory" | "other">): DecisionPorts["inspectPath"] {
  return vi.fn(async (path: string) => entries[path] ?? "absent");
}

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
        detail: "regenerable-path-verification-failed",
      },
    });
    expect(ports.assessCommand).not.toHaveBeenCalled();
  });

  it("names the temporary route when the regenerable route was never tried", async () => {
    const ports = makePorts({ verifyTemporaryPaths: vi.fn().mockResolvedValue(false) });
    await expect(decideToolCall(request("truncate -s 0 dist/app.js", false), ports)).resolves.toEqual({
      kind: "block",
      reason: DESTRUCTIVE_APPROVAL_REASON,
      analysis: {
        kind: "temporary-cleanup-verification",
        detail: "temporary-path-verification-failed",
      },
    });
    expect(ports.verifyRegenerablePaths).not.toHaveBeenCalled();
  });

  describe("regenerable build directories", () => {
    const outsideTemporaryRoot = () =>
      makePorts({
        verifyTemporaryPaths: vi.fn().mockResolvedValue(false),
        verifyRegenerablePaths: vi.fn().mockResolvedValue(true),
      });

    it.each([
      "rm -rf node_modules",
      "rm -rf dist",
      "rm -rf dist/cache",
      "rm -f dist/app.js",
      "rm -f dist/*.js",
      "rm -rf packages/a/node_modules",
      "rmdir dist/cache",
      "rm -rf dist node_modules",
      "rm -rf dist && rmdir out",
    ])("allows %s when every target resolves inside a regenerable directory", async (command) => {
      const ports = outsideTemporaryRoot();
      await expect(decideToolCall(request(command), ports)).resolves.toEqual({ kind: "allow" });
      expect(ports.verifyRegenerablePaths).toHaveBeenCalledExactlyOnceWith(
        expect.arrayContaining([expect.objectContaining({ followsLinks: false })]),
        "/tmp/work",
      );
      expect(ports.assessCommand).not.toHaveBeenCalled();
      expect(ports.requestApproval).not.toHaveBeenCalled();
    });

    it("hands the port every target of the call", async () => {
      const ports = outsideTemporaryRoot();
      await expect(decideToolCall(request("rm -rf dist src"), ports)).resolves.toEqual({ kind: "allow" });
      expect(ports.verifyRegenerablePaths).toHaveBeenCalledExactlyOnceWith(
        [
          { path: "dist", insideMktempDirectory: false, followsLinks: false },
          { path: "src", insideMktempDirectory: false, followsLinks: false },
        ],
        "/tmp/work",
      );
    });

    it.each([
      "unlink dist/app.js",
      "truncate -s 0 dist/app.js",
      "mv dist /tmp/x",
      "chmod 777 dist",
      "chown -R user dist",
      "chmod -R 777 dist",
      "rm -rf dist && truncate -s 0 dist/app.js",
      "rm -rf dist > dist/log; unlink dist/app.js",
      "rm -rf dist; tee dist/app.js",
    ])("requires approval for %s without asking the regenerable port", async (command) => {
      const ports = outsideTemporaryRoot();
      expect((await decideToolCall(request(command, false), ports)).kind).toBe("block");
      expect(ports.verifyRegenerablePaths).not.toHaveBeenCalled();
    });

    it("still allows a wrapper or inert command alongside rm", async () => {
      const ports = outsideTemporaryRoot();
      await expect(decideToolCall(request("echo cleaning && env rm -rf dist"), ports)).resolves.toEqual({
        kind: "allow",
      });
      expect(ports.verifyRegenerablePaths).toHaveBeenCalledOnce();
    });

    it("requires approval when the regenerable port rejects the targets", async () => {
      const ports = makePorts({
        verifyTemporaryPaths: vi.fn().mockResolvedValue(false),
        verifyRegenerablePaths: vi.fn().mockResolvedValue(false),
      });
      await expect(decideToolCall(request("rm -rf src", false), ports)).resolves.toEqual({
        kind: "block",
        reason: DESTRUCTIVE_APPROVAL_REASON,
        analysis: { kind: "temporary-cleanup-verification", detail: "regenerable-path-verification-failed" },
      });
      await expect(decideToolCall(request("rm -rf src"), ports)).resolves.toEqual({ kind: "allow" });
      expect(ports.assessCommand).toHaveBeenCalledOnce();
      expect(ports.requestApproval).toHaveBeenCalledOnce();
    });

    it.each([
      ["rejects", vi.fn().mockRejectedValue(new Error("regenerable check unavailable"))],
      [
        "throws",
        vi.fn(() => {
          throw new Error("regenerable check unavailable");
        }),
      ],
    ])("fails closed with the cause when the regenerable port %s", async (_mode, verifyRegenerablePaths) => {
      const ports = makePorts({ verifyTemporaryPaths: vi.fn().mockResolvedValue(false), verifyRegenerablePaths });
      await expect(decideToolCall(request("rm -rf dist", false), ports)).resolves.toEqual({
        kind: "block",
        reason: DESTRUCTIVE_APPROVAL_REASON,
        analysis: {
          kind: "temporary-cleanup-verification",
          detail: "host-verification-error",
          cause: "regenerable check unavailable",
        },
      });
      expect(ports.assessCommand).not.toHaveBeenCalled();
    });

    it("keeps the temporary route independent of the regenerable one", async () => {
      const ports = makePorts({ verifyRegenerablePaths: vi.fn().mockResolvedValue(false) });
      await expect(decideToolCall(request("rm -rf /tmp/scratch"), ports)).resolves.toEqual({ kind: "allow" });
      expect(ports.verifyTemporaryPaths).toHaveBeenCalledOnce();
      expect(ports.assessCommand).not.toHaveBeenCalled();
    });

    it("fails closed on an answer outside the port contract", async () => {
      const ports = makePorts({
        verifyTemporaryPaths: vi.fn().mockResolvedValue(false),
        verifyRegenerablePaths: vi.fn().mockResolvedValue("yes"),
      });
      expect((await decideToolCall(request("rm -rf dist", false), ports)).kind).toBe("block");
    });

    it("requires a look-alike rm to be approved even against a regenerable directory", async () => {
      const ports = makePorts({
        resolveExecutables: vi.fn().mockResolvedValue(false),
        verifyTemporaryPaths: vi.fn().mockResolvedValue(false),
        verifyRegenerablePaths: vi.fn().mockResolvedValue(true),
      });
      await expect(decideToolCall(request("rm -rf dist", false), ports)).resolves.toEqual({
        kind: "block",
        reason: DESTRUCTIVE_APPROVAL_REASON,
        analysis: { kind: "temporary-cleanup-verification", detail: "executable-resolution-failed" },
      });
    });
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
    await expect(decideToolCall(request("f() { rm -rf build; }", false), ports)).resolves.toEqual({
      kind: "block",
      reason: DESTRUCTIVE_APPROVAL_REASON,
      analysis: { kind: "unsupported-syntax", detail: "function-definition" },
    });
  });

  describe("host path checks", () => {
    it.each(["git checkout main", "git checkout HEAD~1"])("allows %s when no such entry exists", async (command) => {
      const ports = makePorts({ inspectPath: inventory({ "README.md": "other", src: "directory" }) });
      await expect(decideToolCall(request(command), ports)).resolves.toEqual({ kind: "allow" });
      expect(ports.inspectPath).toHaveBeenCalledWith(command.split(" ")[2], "/tmp/work");
      expect(ports.assessCommand).not.toHaveBeenCalled();
      expect(ports.requestApproval).not.toHaveBeenCalled();
    });

    it("requires approval for a checkout whose operand names an existing file", async () => {
      const ports = makePorts({ inspectPath: inventory({ "README.md": "other" }) });
      await expect(decideToolCall(request("git checkout README.md", false), ports)).resolves.toEqual({
        kind: "block",
        reason: DESTRUCTIVE_APPROVAL_REASON,
        analysis: { kind: "host-path-check", detail: "path-exists" },
      });
    });

    it("requires approval for a checkout whose operand names an existing directory", async () => {
      const ports = makePorts({ inspectPath: inventory({ src: "directory" }) });
      await expect(decideToolCall(request("git checkout src", false), ports)).resolves.toEqual({
        kind: "block",
        reason: DESTRUCTIVE_APPROVAL_REASON,
        analysis: { kind: "host-path-check", detail: "path-exists" },
      });
    });

    it.each([
      "git checkout main README.md",
      "git checkout -f main",
      "git checkout -B feature",
      "git checkout -- src/a.ts",
      "git -C sub checkout main",
      "git --git-dir=.git checkout main",
      "git --work-tree=sub checkout main",
      "cd sub && git checkout main",
      "GIT_WORK_TREE=sub git checkout main",
      "git checkout $BRANCH",
      "git checkout '*'",
      "git checkout ~",
      "mv -f a b",
      "mv a /etc/b",
      "mv *.txt docs/",
      "mv -t src/ a.ts b.ts c.ts",
      "mv a.ts b.ts c.ts $DEST",
    ])("requires approval for %s without asking the host", async (command) => {
      // The temporary-root proof is refused too, so an `mv` that reaches it cannot pass on the stub.
      const ports = makePorts({ inspectPath: inventory({}), verifyTemporaryPaths: vi.fn().mockResolvedValue(false) });
      const decision = await decideToolCall(request(command, false), ports);
      expect(decision.kind).toBe("block");
      expect(ports.inspectPath).not.toHaveBeenCalled();
      expect(ports.assessCommand).not.toHaveBeenCalled();
    });

    it.each(["git checkout -b feature/x", "git checkout --detach v1.2.3", "git checkout -"])(
      "allows %s without asking the host",
      async (command) => {
        const ports = makePorts({ inspectPath: inventory({}) });
        await expect(decideToolCall(request(command), ports)).resolves.toEqual({ kind: "allow" });
        expect(ports.inspectPath).not.toHaveBeenCalled();
      },
    );

    it("resolves the command word through the host before allowing", async () => {
      const ports = makePorts({ inspectPath: inventory({}) });
      await expect(decideToolCall(request("git checkout main"), ports)).resolves.toEqual({ kind: "allow" });
      expect(ports.resolveExecutables).toHaveBeenCalledExactlyOnceWith(["git"], "/tmp/work");
      await expect(decideToolCall(request("env -u X mv a.ts b.ts c.ts src/", false), ports)).resolves.toMatchObject({
        kind: "block",
        analysis: { kind: "host-path-check", detail: "path-is-not-a-directory" },
      });
      expect(ports.resolveExecutables).toHaveBeenCalledWith(["env", "mv"], "/tmp/work");
    });

    it("requires approval when the command word resolves to a look-alike executable", async () => {
      const ports = makePorts({ inspectPath: inventory({}), resolveExecutables: vi.fn().mockResolvedValue(false) });
      await expect(decideToolCall(request("git checkout main", false), ports)).resolves.toEqual({
        kind: "block",
        reason: DESTRUCTIVE_APPROVAL_REASON,
        analysis: { kind: "host-path-check", detail: "executable-resolution-failed" },
      });
    });

    it("allows a multi-operand mv into an existing directory", async () => {
      const ports = makePorts({ inspectPath: inventory({ "src/": "directory" }) });
      await expect(decideToolCall(request("mv a.ts b.ts c.ts src/"), ports)).resolves.toEqual({ kind: "allow" });
      expect(ports.inspectPath).toHaveBeenCalledExactlyOnceWith("src/", "/tmp/work");
      expect(ports.assessCommand).not.toHaveBeenCalled();
    });

    it.each([
      ["absent", inventory({})],
      ["a file", inventory({ "d.ts": "other" })],
    ])("requires approval for a multi-operand mv whose destination is %s", async (_state, inspectPath) => {
      const ports = makePorts({ inspectPath });
      await expect(decideToolCall(request("mv a.ts b.ts c.ts d.ts", false), ports)).resolves.toEqual({
        kind: "block",
        reason: DESTRUCTIVE_APPROVAL_REASON,
        analysis: { kind: "host-path-check", detail: "path-is-not-a-directory" },
      });
    });

    it.each(["git fetch origin && git checkout main", "printf x > main; git checkout main", "mv -S .bak a.ts b.ts"])(
      "requires approval for %s because the host answer could not hold",
      async (command) => {
        const ports = makePorts({ inspectPath: inventory({}), verifyTemporaryPaths: vi.fn().mockResolvedValue(false) });
        expect((await decideToolCall(request(command, false), ports)).kind).toBe("block");
        expect(ports.inspectPath).not.toHaveBeenCalled();
      },
    );

    it("assesses and requests approval when a host check fails and approval is available", async () => {
      const ports = makePorts({ inspectPath: inventory({ main: "other" }) });
      await expect(decideToolCall(request("git checkout main"), ports)).resolves.toEqual({ kind: "allow" });
      expect(ports.assessCommand).toHaveBeenCalledOnce();
      expect(ports.requestApproval).toHaveBeenCalledOnce();
    });

    it.each([
      ["rejects", vi.fn().mockRejectedValue(new Error("inspection unavailable"))],
      [
        "throws",
        vi.fn(() => {
          throw new Error("inspection unavailable");
        }),
      ],
    ])("fails closed with the cause when the port %s", async (_mode, inspectPath) => {
      for (const command of ["git checkout main", "mv a.ts b.ts c.ts src/"]) {
        const ports = makePorts({ inspectPath });
        await expect(decideToolCall(request(command, false), ports)).resolves.toEqual({
          kind: "block",
          reason: DESTRUCTIVE_APPROVAL_REASON,
          analysis: { kind: "host-path-check", detail: "host-verification-error", cause: "inspection unavailable" },
        });
      }
    });

    it("fails closed on an answer outside the port contract", async () => {
      const ports = makePorts({ inspectPath: vi.fn().mockResolvedValue(undefined) });
      await expect(decideToolCall(request("git checkout main", false), ports)).resolves.toMatchObject({
        kind: "block",
        analysis: { kind: "host-path-check", detail: "path-exists" },
      });
    });

    it("fails closed without a host call when the working directory is unknown", async () => {
      const ports = makePorts({ inspectPath: inventory({}) });
      await expect(decideToolCall(request("git checkout main", false, ""), ports)).resolves.toEqual({
        kind: "block",
        reason: DESTRUCTIVE_APPROVAL_REASON,
        analysis: {
          kind: "host-path-check",
          detail: "host-verification-error",
          cause: "working directory is unknown",
        },
      });
      expect(ports.inspectPath).not.toHaveBeenCalled();
    });
  });
});
