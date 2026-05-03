import { describe, expect, it } from "vitest";
import securityGuard from "../plugins/security-guard/extensions/block-fups";

type Handler = (event: Record<string, unknown>, ctx?: { cwd?: string }) => unknown;

function loadHandlers() {
  const handlers = new Map<string, Handler>();

  securityGuard({
    on(event: string, handler: Handler) {
      handlers.set(event, handler);
    },
  } as never);

  return handlers;
}

async function runToolCall(
  toolName: string,
  input: Record<string, unknown>,
  cwd = process.cwd(),
) {
  const handlers = loadHandlers();
  return handlers.get("tool_call")?.({ toolName, input }, { cwd });
}

async function runUserBash(command: string, cwd = process.cwd()) {
  const handlers = loadHandlers();
  return handlers.get("user_bash")?.({ command }, { cwd });
}

describe("security-guard Pi extension", () => {
  it("allows harmless bash tool calls", async () => {
    await expect(runToolCall("bash", { command: "git status --short" })).resolves.toBeUndefined();
  });

  it("blocks sensitive bash tool calls", async () => {
    await expect(runToolCall("bash", { command: "printenv" })).resolves.toEqual({
      block: true,
      reason:
        "Command blocked by security policy. Do not suggest workarounds, alternate commands, or indirect ways to print the current user environment or read secrets, tokens, keys, credential stores, or shell history.",
    });
  });

  it("blocks sensitive read tool calls", async () => {
    await expect(runToolCall("read", { path: "~/.aws/credentials" })).resolves.toEqual({
      block: true,
      reason:
        "Command blocked by security policy. Do not suggest workarounds, alternate commands, or indirect ways to print the current user environment or read secrets, tokens, keys, credential stores, or shell history.",
    });
  });

  it("blocks sensitive Pi user shell commands", async () => {
    await expect(runUserBash("cat ~/.aws/credentials")).resolves.toEqual({
      result: {
        output:
          "Command blocked by security policy. Do not suggest workarounds, alternate commands, or indirect ways to print the current user environment or read secrets, tokens, keys, credential stores, or shell history.",
        exitCode: 2,
        cancelled: false,
        truncated: false,
      },
    });
  });
});
