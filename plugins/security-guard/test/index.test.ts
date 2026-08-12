import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import extension, { DESTRUCTIVE_APPROVAL_REASON } from "../index.js";

function makeMockPi() {
  return { on: vi.fn() };
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

  it("allows approved destructive Bash tool calls", async () => {
    const pi = makeMockPi();
    extension(pi as never);
    const handler = pi.on.mock.calls.find(([event]) => event === "tool_call")?.[1];

    await expect(
      handler(
        { toolName: "bash", input: { command: "mv old new" } },
        { hasUI: true, ui: { confirm: vi.fn().mockResolvedValue(true) } },
      ),
    ).resolves.toBeUndefined();
  });
});
