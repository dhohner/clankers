import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const PROJECT_BINARIES = new Set([
  "astro",
  "ava",
  "babel",
  "biome",
  "cypress",
  "eslint",
  "jest",
  "mocha",
  "next",
  "nx",
  "playwright",
  "prettier",
  "rollup",
  "stylelint",
  "sv",
  "svelte-kit",
  "tailwindcss",
  "ts-node",
  "tsc",
  "tsserver",
  "tsx",
  "turbo",
  "vite",
  "vitest",
  "webpack",
]);

type ToolCallEvent = {
  toolName?: string;
  input?: Record<string, unknown>;
  args?: Record<string, unknown>;
};

type UserBashEvent = {
  command?: string;
  cwd?: string;
};

function getToolInput(event: ToolCallEvent): Record<string, unknown> {
  return event.input ?? event.args ?? {};
}

function getString(input: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string") return value;
  }

  return "";
}

function startsWithCommand(command: string, binary: string): boolean {
  return new RegExp(`^\\s*${binary}(?:\\s|$)`).test(command);
}

function hasLocalNodeBinary(binary: string, cwd: string): boolean {
  let dir = resolve(cwd || process.cwd());

  while (dir) {
    const candidate = join(dir, "node_modules", ".bin", binary);
    try {
      const stat = existsSync(candidate) ? statSync(candidate) : undefined;
      if (stat?.isFile() && (stat.mode & 0o111) !== 0) return true;
    } catch {
      // Ignore inaccessible paths and keep walking upward.
    }

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return false;
}

function extractSimpleNpxInvocation(
  command: string,
): { binary: string; remainder: string } | undefined {
  const remainder = command.replace(/^\s*npx(?:\s+|$)/, "").trimStart();
  if (!remainder || remainder.startsWith("-")) return undefined;

  const binary = remainder.split(/\s+/, 1)[0] ?? "";
  if (!binary) return undefined;

  return { binary, remainder };
}

function replacementForNpm(command: string): string {
  const remainder = command.replace(/^\s*npm(?:\s+|$)/, "").trimStart();
  return remainder ? `pnpm ${remainder}` : "pnpm";
}

function replacementForNpx(command: string, cwd: string): string | undefined {
  const invocation = extractSimpleNpxInvocation(command);
  if (!invocation) return undefined;

  const runner =
    invocation.binary.includes("/") ||
    (!hasLocalNodeBinary(invocation.binary, cwd) &&
      !PROJECT_BINARIES.has(invocation.binary))
      ? "pnpm dlx"
      : "pnpm exec";

  return `${runner} ${invocation.remainder}`;
}

function blockReason(command: string, cwd: string): string | undefined {
  if (startsWithCommand(command, "npm")) {
    return `Blocked: use ${replacementForNpm(command)} instead of ${command.trim()}.`;
  }

  if (startsWithCommand(command, "npx")) {
    const replacement = replacementForNpx(command, cwd);
    return replacement
      ? `Blocked: use ${replacement} instead of ${command.trim()}.`
      : "Blocked: use pnpm dlx instead of npx.";
  }

  return undefined;
}

export default function blockPackageManagers(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    const toolEvent = event as ToolCallEvent;
    const toolName = toolEvent.toolName ?? "";
    if (toolName !== "bash") return undefined;

    const input = getToolInput(toolEvent);
    const command = getString(input, ["command"]);
    const cwd =
      getString(input, ["cwd", "working_directory", "workingDirectory"]) ||
      ctx.cwd ||
      process.cwd();

    const reason = blockReason(command, cwd);
    if (reason) return { block: true, reason };

    return undefined;
  });

  pi.on("user_bash", async (event, ctx) => {
    const userBashEvent = event as UserBashEvent;
    const command = userBashEvent.command ?? "";
    const cwd = userBashEvent.cwd || ctx.cwd || process.cwd();
    const reason = blockReason(command, cwd);
    if (!reason) return undefined;

    return {
      result: {
        output: reason,
        exitCode: 2,
        cancelled: false,
        truncated: false,
      },
    };
  });
}
