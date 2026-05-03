import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import blockPackageManagers from "../plugins/block-package-managers/extensions/block-package-managers";

type Handler = (event: Record<string, unknown>, ctx: { cwd?: string }) => unknown;

function loadHandlers() {
  const handlers = new Map<string, Handler>();

  blockPackageManagers({
    on(event: string, handler: Handler) {
      handlers.set(event, handler);
    },
  } as never);

  return handlers;
}

async function runToolCall(command: string, cwd = process.cwd()) {
  const handlers = loadHandlers();
  return handlers.get("tool_call")?.(
    { toolName: "bash", input: { command, cwd } },
    { cwd },
  );
}

async function runUserBash(command: string, cwd = process.cwd()) {
  const handlers = loadHandlers();
  return handlers.get("user_bash")?.({ command, cwd }, { cwd });
}

describe("block-package-managers Pi extension", () => {
  it("ignores non-bash tool calls", async () => {
    const handlers = loadHandlers();

    await expect(
      handlers.get("tool_call")?.(
        { toolName: "read", input: { command: "npm install" } },
        { cwd: process.cwd() },
      ),
    ).resolves.toBeUndefined();
  });

  it("allows harmless bash tool calls", async () => {
    await expect(runToolCall("pnpm install")).resolves.toBeUndefined();
  });

  it("blocks npm in bash tool calls with a pnpm equivalent", async () => {
    await expect(runToolCall("npm install")).resolves.toEqual({
      block: true,
      reason: "Blocked: use pnpm install instead of npm install.",
    });
  });

  it("blocks bare npm in bash tool calls", async () => {
    await expect(runToolCall("npm")).resolves.toEqual({
      block: true,
      reason: "Blocked: use pnpm instead of npm.",
    });
  });

  it("uses pnpm exec for local npx project binaries", async () => {
    const cwd = join(tmpdir(), `block-package-managers-${Date.now()}`);
    const binary = join(cwd, "node_modules", ".bin", "prettier");
    mkdirSync(join(cwd, "node_modules", ".bin"), { recursive: true });
    writeFileSync(binary, "#!/usr/bin/env sh\n");
    chmodSync(binary, 0o755);

    try {
      await expect(runToolCall("npx prettier --write .", cwd)).resolves.toEqual({
        block: true,
        reason:
          "Blocked: use pnpm exec prettier --write . instead of npx prettier --write ..",
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("uses pnpm dlx for one-off npx package commands", async () => {
    await expect(runToolCall("npx create-vite@latest demo")).resolves.toEqual({
      block: true,
      reason:
        "Blocked: use pnpm dlx create-vite@latest demo instead of npx create-vite@latest demo.",
    });
  });

  it("blocks unsupported npx forms with generic pnpm dlx guidance", async () => {
    await expect(runToolCall("npx --yes cowsay hi")).resolves.toEqual({
      block: true,
      reason: "Blocked: use pnpm dlx instead of npx.",
    });
  });

  it("blocks npm in Pi user shell commands", async () => {
    await expect(runUserBash("npm install")).resolves.toEqual({
      result: {
        output: "Blocked: use pnpm install instead of npm install.",
        exitCode: 2,
        cancelled: false,
        truncated: false,
      },
    });
  });

  it("blocks npx in Pi user shell commands", async () => {
    await expect(runUserBash("npx create-vite@latest demo")).resolves.toEqual({
      result: {
        output:
          "Blocked: use pnpm dlx create-vite@latest demo instead of npx create-vite@latest demo.",
        exitCode: 2,
        cancelled: false,
        truncated: false,
      },
    });
  });
});
