import { describe, expect, it, vi } from "vitest";
import extension, { DESTRUCTIVE_APPROVAL_REASON } from "../index.js";

function makeMockPi() {
  return { on: vi.fn() };
}

describe("extension entrypoint", () => {
  it("registers tool_call and user_bash handlers", () => {
    const pi = makeMockPi();
    extension(pi as never);

    const events = pi.on.mock.calls.map(([event]) => event);
    expect(events).toEqual(["tool_call", "user_bash"]);
  });

  it("blocks Bash tool calls regardless of casing", async () => {
    const pi = makeMockPi();
    extension(pi as never);
    const handler = pi.on.mock.calls.find(([event]) => event === "tool_call")?.[1];

    await expect(handler({ toolName: "Bash", input: { command: "printenv" } })).resolves.toMatchObject({ block: true });
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
