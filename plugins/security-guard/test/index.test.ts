import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import extension, {
  DESTRUCTIVE_APPROVAL_REASON,
  SAFETY_EVALUATION_BLOCK_PREFIX,
  SAFETY_EVALUATION_CANCELLED_REASON,
  SAFETY_EVALUATION_WORKING_MESSAGE,
} from "../index.js";

function makeMockPi() {
  return { on: vi.fn() };
}

function makeAssessmentReply(verdict = "unsafe") {
  return {
    role: "assistant",
    content: [
      { type: "text", text: JSON.stringify({ verdict, intent: "Deletes a file", reason: "Removal is permanent" }) },
    ],
    stopReason: "stop",
  };
}

function makeApprovalContext({ approve = true, verdict = "unsafe", signal = undefined as AbortSignal | undefined } = {}) {
  return {
    hasUI: true,
    cwd: "/workspace",
    signal,
    ui: { confirm: vi.fn().mockResolvedValue(approve), setWorkingMessage: vi.fn() },
    modelRegistry: {
      find: vi.fn().mockReturnValue({ provider: "openai", id: "gpt-5.6-luna" }),
      hasConfiguredAuth: vi.fn().mockReturnValue(true),
      complete: vi.fn().mockResolvedValue(makeAssessmentReply(verdict)),
    },
  };
}

function makeToolCallHandler() {
  const pi = makeMockPi();
  extension(pi as never);
  return pi.on.mock.calls.find(([event]) => event === "tool_call")?.[1];
}

describe("extension entrypoint", () => {
  it("registers tool_call, tool_result, and user_bash handlers", () => {
    const pi = makeMockPi();
    extension(pi as never);

    // The registration order carries no meaning, so only the set of handled events is asserted.
    const events = pi.on.mock.calls.map(([event]) => event);
    expect(events).toHaveLength(3);
    expect(events).toEqual(expect.arrayContaining(["tool_call", "tool_result", "user_bash"]));
  });

  it("blocks Bash tool calls regardless of casing", async () => {
    const pi = makeMockPi();
    extension(pi as never);
    const handler = pi.on.mock.calls.find(([event]) => event === "tool_call")?.[1];

    await expect(handler({ toolName: "Bash", input: { command: "printenv" } })).resolves.toMatchObject({ block: true });
  });

  it("allows the PI environment pipeline", async () => {
    const pi = makeMockPi();
    extension(pi as never);
    const handler = pi.on.mock.calls.find(([event]) => event === "tool_call")?.[1];

    await expect(
      handler({ toolName: "bash", input: { command: "env | grep '^PI_' | sort" } }, { hasUI: false }),
    ).resolves.toBeUndefined();
  });

  it("blocks read tool calls using args payloads", async () => {
    const pi = makeMockPi();
    extension(pi as never);
    const handler = pi.on.mock.calls.find(([event]) => event === "tool_call")?.[1];

    await expect(handler({ toolName: "read", args: { path: ".env" } }, { hasUI: false })).resolves.toMatchObject({ block: true });
  });

  it("requires approval for destructive Bash tool calls", async () => {
    const pi = makeMockPi();
    extension(pi as never);
    const handler = pi.on.mock.calls.find(([event]) => event === "tool_call")?.[1];

    await expect(handler({ toolName: "bash", input: { command: "rm file.txt" } }, { hasUI: false })).resolves.toEqual({
      block: true,
      reason: DESTRUCTIVE_APPROVAL_REASON,
    });
  });

  it("allows removing a temporary directory created by an earlier Bash call", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "security-guard-test-"));

    try {
      const pi = makeMockPi();
      extension(pi as never);
      const resultHandler = pi.on.mock.calls.find(([event]) => event === "tool_result")?.[1];
      const callHandler = pi.on.mock.calls.find(([event]) => event === "tool_call")?.[1];

      await resultHandler({
        toolName: "bash",
        input: { command: "mktemp -d" },
        content: [{ type: "text", text: `${temporaryDirectory}\n` }],
        isError: false,
      });

      const removalEvent = { toolName: "bash", input: { command: `rm -rf '${temporaryDirectory}'` } };
      await expect(callHandler(removalEvent, { hasUI: false })).resolves.toBeUndefined();
      await expect(callHandler(removalEvent, { hasUI: false })).resolves.toEqual({
        block: true,
        reason: DESTRUCTIVE_APPROVAL_REASON,
      });
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("tracks temporary directories from results that omit isError", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "security-guard-test-"));

    try {
      const pi = makeMockPi();
      extension(pi as never);
      const resultHandler = pi.on.mock.calls.find(([event]) => event === "tool_result")?.[1];
      const callHandler = pi.on.mock.calls.find(([event]) => event === "tool_call")?.[1];

      await resultHandler({
        toolName: "bash",
        input: { command: "mktemp -d" },
        content: [{ type: "text", text: `${temporaryDirectory}\n` }],
      });

      await expect(
        callHandler({ toolName: "bash", input: { command: `rm -rf '${temporaryDirectory}'` } }, { hasUI: false }),
      ).resolves.toBeUndefined();
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("ignores failed mktemp results", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "security-guard-test-"));

    try {
      const pi = makeMockPi();
      extension(pi as never);
      const resultHandler = pi.on.mock.calls.find(([event]) => event === "tool_result")?.[1];
      const callHandler = pi.on.mock.calls.find(([event]) => event === "tool_call")?.[1];

      await resultHandler({
        toolName: "bash",
        input: { command: "mktemp -d" },
        content: [{ type: "text", text: `${temporaryDirectory}\n` }],
        isError: true,
      });

      await expect(
        callHandler({ toolName: "bash", input: { command: `rm -rf '${temporaryDirectory}'` } }, { hasUI: false }),
      ).resolves.toEqual({ block: true, reason: DESTRUCTIVE_APPROVAL_REASON });
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("never treats the temporary root itself as a created directory", async () => {
    const pi = makeMockPi();
    extension(pi as never);
    const resultHandler = pi.on.mock.calls.find(([event]) => event === "tool_result")?.[1];
    const callHandler = pi.on.mock.calls.find(([event]) => event === "tool_call")?.[1];

    await resultHandler({
      toolName: "bash",
      input: { command: "mktemp -d" },
      content: [{ type: "text", text: `${tmpdir()}\n` }],
      isError: false,
    });

    await expect(
      callHandler({ toolName: "bash", input: { command: `rm -rf '${tmpdir()}'` } }, { hasUI: false }),
    ).resolves.toEqual({ block: true, reason: DESTRUCTIVE_APPROVAL_REASON });
  });

  it("requires approval if a tracked temporary directory was replaced", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "security-guard-test-"));
    const originalDirectory = `${temporaryDirectory}-original`;

    try {
      const pi = makeMockPi();
      extension(pi as never);
      const resultHandler = pi.on.mock.calls.find(([event]) => event === "tool_result")?.[1];
      const callHandler = pi.on.mock.calls.find(([event]) => event === "tool_call")?.[1];

      await resultHandler({
        toolName: "bash",
        input: { command: "mktemp -d" },
        content: [{ type: "text", text: `${temporaryDirectory}\n` }],
        isError: false,
      });
      await rename(temporaryDirectory, originalDirectory);
      await mkdir(temporaryDirectory);

      await expect(
        callHandler(
          { toolName: "bash", input: { command: `rm -rf '${temporaryDirectory}'` } },
          { hasUI: false },
        ),
      ).resolves.toEqual({ block: true, reason: DESTRUCTIVE_APPROVAL_REASON });
    } finally {
      await Promise.all([
        rm(temporaryDirectory, { recursive: true, force: true }),
        rm(originalDirectory, { recursive: true, force: true }),
      ]);
    }
  });

  it("allows approved destructive Bash tool calls after one safety assessment", async () => {
    const handler = makeToolCallHandler();
    const ctx = makeApprovalContext();

    await expect(handler({ toolName: "bash", input: { command: "rm old.txt" } }, ctx)).resolves.toBeUndefined();

    expect(ctx.modelRegistry.find).toHaveBeenCalledExactlyOnceWith("openai", "gpt-5.6-luna");
    expect(ctx.modelRegistry.complete).toHaveBeenCalledOnce();
    const [, context, options] = ctx.modelRegistry.complete.mock.calls[0];
    expect(context.messages[0].content).toContain("rm old.txt");
    expect(context.messages[0].content).toContain("/workspace");
    expect(context.tools).toBeUndefined();
    expect(options).toMatchObject({ reasoningEffort: "high" });
  });

  it("shows only the assessment in the approval dialog, not the command", async () => {
    const handler = makeToolCallHandler();
    const ctx = makeApprovalContext();

    await handler({ toolName: "bash", input: { command: "rm file.txt" } }, ctx);

    const [title, message] = ctx.ui.confirm.mock.calls[0];
    expect(title).toBe("Approve destructive command?");
    expect(message).toBe("Verdict: unsafe\nIntent: Deletes a file\nReason: Removal is permanent");
    expect(message).not.toContain("rm file.txt");
  });

  it("keeps unsafe and uncertain verdicts approvable but never auto-executes them", async () => {
    for (const verdict of ["unsafe", "uncertain"]) {
      const handler = makeToolCallHandler();

      const approved = makeApprovalContext({ approve: true, verdict });
      await expect(handler({ toolName: "bash", input: { command: "rm file.txt" } }, approved)).resolves.toBeUndefined();
      expect(approved.ui.confirm).toHaveBeenCalledOnce();

      const rejected = makeApprovalContext({ approve: false, verdict });
      await expect(handler({ toolName: "bash", input: { command: "rm file.txt" } }, rejected)).resolves.toEqual({
        block: true,
        reason: DESTRUCTIVE_APPROVAL_REASON,
      });
    }
  });

  it("evaluates each destructive tool call independently", async () => {
    const handler = makeToolCallHandler();
    const ctx = makeApprovalContext();

    await handler({ toolName: "bash", input: { command: "rm one.txt" } }, ctx);
    await handler({ toolName: "bash", input: { command: "rm two.txt" } }, ctx);

    expect(ctx.modelRegistry.complete).toHaveBeenCalledTimes(2);
    expect(ctx.ui.confirm).toHaveBeenCalledTimes(2);
  });

  it("blocks without an approval dialog when the turn is cancelled during evaluation", async () => {
    const handler = makeToolCallHandler();
    const controller = new AbortController();
    const ctx = makeApprovalContext({ signal: controller.signal });
    ctx.modelRegistry.complete = vi.fn().mockImplementation(async () => {
      controller.abort();
      return makeAssessmentReply();
    });

    await expect(handler({ toolName: "bash", input: { command: "rm file.txt" } }, ctx)).resolves.toEqual({
      block: true,
      reason: SAFETY_EVALUATION_CANCELLED_REASON,
    });
    expect(ctx.ui.confirm).not.toHaveBeenCalled();
    expect(ctx.ui.setWorkingMessage.mock.calls).toEqual([[SAFETY_EVALUATION_WORKING_MESSAGE], []]);
  });

  it("blocks even an approved command when the turn is cancelled during approval", async () => {
    const handler = makeToolCallHandler();
    const controller = new AbortController();
    const ctx = makeApprovalContext({ signal: controller.signal });
    ctx.ui.confirm = vi.fn().mockImplementation(async () => {
      controller.abort();
      return true;
    });

    await expect(handler({ toolName: "bash", input: { command: "rm file.txt" } }, ctx)).resolves.toEqual({
      block: true,
      reason: SAFETY_EVALUATION_CANCELLED_REASON,
    });
    expect(ctx.ui.confirm.mock.calls[0]?.[2]).toEqual({ signal: controller.signal });
  });

  it("blocks the command when the safety evaluation fails, without asking for approval", async () => {
    const handler = makeToolCallHandler();
    const ctx = makeApprovalContext();
    ctx.modelRegistry.complete = vi.fn().mockRejectedValue(new Error("request failed"));

    const result = await handler({ toolName: "bash", input: { command: "rm file.txt" } }, ctx);

    expect(result.block).toBe(true);
    expect(result.reason).toContain(SAFETY_EVALUATION_BLOCK_PREFIX);
    expect(ctx.ui.confirm).not.toHaveBeenCalled();
  });

  it("sets the working message during evaluation and restores it on success, rejection, and failure", async () => {
    const handler = makeToolCallHandler();

    for (const ctx of [
      makeApprovalContext({ approve: true }),
      makeApprovalContext({ approve: false }),
      (() => {
        const failing = makeApprovalContext();
        failing.modelRegistry.complete = vi.fn().mockRejectedValue(new Error("boom"));
        return failing;
      })(),
    ]) {
      await handler({ toolName: "bash", input: { command: "rm file.txt" } }, ctx);
      expect(ctx.ui.setWorkingMessage.mock.calls).toEqual([[SAFETY_EVALUATION_WORKING_MESSAGE], []]);
    }
  });

  it("blocks matched commands without any model request when no UI is available", async () => {
    const handler = makeToolCallHandler();
    const ctx = { ...makeApprovalContext(), hasUI: false };

    await expect(handler({ toolName: "bash", input: { command: "rm file.txt" } }, ctx)).resolves.toEqual({
      block: true,
      reason: DESTRUCTIVE_APPROVAL_REASON,
    });
    expect(ctx.modelRegistry.find).not.toHaveBeenCalled();
    expect(ctx.modelRegistry.complete).not.toHaveBeenCalled();
  });

  it("blocks credential commands before any safety evaluation", async () => {
    const handler = makeToolCallHandler();
    const ctx = makeApprovalContext();

    await expect(handler({ toolName: "bash", input: { command: "cat ~/.aws/credentials" } }, ctx)).resolves.toMatchObject({
      block: true,
    });
    expect(ctx.modelRegistry.complete).not.toHaveBeenCalled();
    expect(ctx.ui.confirm).not.toHaveBeenCalled();
  });

  it("runs unmatched commands without any model request or approval dialog", async () => {
    const handler = makeToolCallHandler();
    const ctx = makeApprovalContext();

    await expect(handler({ toolName: "bash", input: { command: "ls -la" } }, ctx)).resolves.toBeUndefined();
    expect(ctx.modelRegistry.complete).not.toHaveBeenCalled();
    expect(ctx.ui.confirm).not.toHaveBeenCalled();
  });

  it("removes verified tracked temporary directories without any model request", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "security-guard-test-"));

    try {
      const pi = makeMockPi();
      extension(pi as never);
      const resultHandler = pi.on.mock.calls.find(([event]) => event === "tool_result")?.[1];
      const callHandler = pi.on.mock.calls.find(([event]) => event === "tool_call")?.[1];
      const ctx = makeApprovalContext();

      await resultHandler({
        toolName: "bash",
        input: { command: "mktemp -d" },
        content: [{ type: "text", text: `${temporaryDirectory}\n` }],
        isError: false,
      });

      await expect(
        callHandler({ toolName: "bash", input: { command: `rm -rf '${temporaryDirectory}'` } }, ctx),
      ).resolves.toBeUndefined();
      expect(ctx.modelRegistry.complete).not.toHaveBeenCalled();
      expect(ctx.ui.confirm).not.toHaveBeenCalled();
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
