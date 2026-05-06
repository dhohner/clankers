import { describe, expect, it, vi } from "vitest";
import extension from "@/src/index.js";

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

    await expect(handler({ toolName: "read", args: { path: ".env" } })).resolves.toMatchObject({ block: true });
  });
});
