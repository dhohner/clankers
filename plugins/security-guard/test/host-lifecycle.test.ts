import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createBashToolDefinition,
  discoverAndLoadExtensions,
  ExtensionRunner,
  type ExtensionError,
  type ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { DESTRUCTIVE_APPROVAL_REASON } from "../index.js";

const EXTENSION_PACKAGE_DIRECTORY = fileURLToPath(new URL("..", import.meta.url));

type BashRun = {
  blocked: boolean;
  blockReason: string | undefined;
  isError: boolean;
  text: string;
};

/**
 * Drives the extension through Pi's own host path instead of calling captured handlers directly:
 * the real jiti-based extension loader, the real ExtensionRunner event dispatch and handler
 * context, and the real bash tool executing real commands. Only the model registry and the
 * approval UI are deterministic doubles, which keeps the evaluator call and the approval dialog
 * observable without a live model request.
 */
async function createHost({ approve = true } = {}) {
  const workingDirectory = await mkdtemp(join(tmpdir(), "security-guard-host-cwd-"));
  const agentDirectory = await mkdtemp(join(tmpdir(), "security-guard-host-agent-"));

  const loaded = await discoverAndLoadExtensions([EXTENSION_PACKAGE_DIRECTORY], workingDirectory, agentDirectory);
  expect(loaded.errors).toEqual([]);
  expect(loaded.extensions).toHaveLength(1);

  const modelRegistry = {
    find: vi.fn().mockReturnValue({ provider: "openai", id: "gpt-5.6-luna" }),
    hasConfiguredAuth: vi.fn().mockReturnValue(true),
    complete: vi.fn().mockResolvedValue({
      role: "assistant",
      content: [
        { type: "text", text: JSON.stringify({ verdict: "unsafe", intent: "Deletes a path", reason: "Removal is permanent" }) },
      ],
      stopReason: "stop",
    }),
  };
  const ui = { confirm: vi.fn().mockResolvedValue(approve), setWorkingMessage: vi.fn() };

  const runner = new ExtensionRunner(loaded.extensions, loaded.runtime, workingDirectory, {} as never, modelRegistry as never);
  const extensionErrors: ExtensionError[] = [];
  runner.onError((error) => extensionErrors.push(error));
  runner.setUIContext(ui as never, "tui");

  const bashTool = createBashToolDefinition(workingDirectory);
  let toolCallCount = 0;

  // Mirrors the agent loop's tool lifecycle: emit tool_call, stop on block, otherwise execute the
  // real tool (errors become an error result exactly like createErrorToolResult) and emit the
  // tool_result the host would emit, including the original input.
  async function runBash(command: string): Promise<BashRun> {
    toolCallCount += 1;
    const toolCallId = `host-call-${toolCallCount}`;
    const input = { command };

    const callResult: ToolCallEventResult | undefined = await runner.emitToolCall({
      type: "tool_call",
      toolName: "bash",
      toolCallId,
      input,
    });
    if (callResult?.block) {
      return { blocked: true, blockReason: callResult.reason, isError: false, text: "" };
    }

    let content: Array<{ type: string; text?: string }>;
    let details: unknown;
    let isError = false;
    try {
      const result = await bashTool.execute(toolCallId, input, undefined as never, undefined, undefined as never);
      content = result.content as never;
      details = result.details;
    } catch (error) {
      content = [{ type: "text", text: error instanceof Error ? error.message : String(error) }];
      details = {};
      isError = true;
    }

    await runner.emitToolResult({
      type: "tool_result",
      toolName: "bash",
      toolCallId,
      input,
      content,
      details,
      isError,
    } as never);

    const text = content
      .filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("\n");
    return { blocked: false, blockReason: undefined, isError, text };
  }

  async function cleanup(extraPaths: readonly string[] = []) {
    await Promise.all(
      [workingDirectory, agentDirectory, ...extraPaths].map((path) => rm(path, { recursive: true, force: true })),
    );
  }

  return { runBash, cleanup, modelRegistry, ui, extensionErrors };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("reported host lifecycle", () => {
  it("removes a standalone mktemp -d directory without evaluation or approval, exactly once", async () => {
    const host = await createHost();
    let createdDirectory: string | undefined;

    try {
      const created = await host.runBash("mktemp -d");
      expect(created.blocked).toBe(false);
      expect(created.isError).toBe(false);

      const outputLines = created.text.trim().split(/\r?\n/);
      expect(outputLines).toHaveLength(1);
      createdDirectory = outputLines[0]!;
      expect(createdDirectory.startsWith("/")).toBe(true);
      await expect(pathExists(createdDirectory)).resolves.toBe(true);

      const removed = await host.runBash(`rm -rf ${createdDirectory}`);
      expect(removed.blocked).toBe(false);
      expect(removed.isError).toBe(false);
      await expect(pathExists(createdDirectory)).resolves.toBe(false);
      expect(host.modelRegistry.complete).not.toHaveBeenCalled();
      expect(host.ui.confirm).not.toHaveBeenCalled();

      // One-use consumption: the identical command immediately re-enters evaluation and approval.
      const repeated = await host.runBash(`rm -rf ${createdDirectory}`);
      expect(host.modelRegistry.complete).toHaveBeenCalledOnce();
      expect(host.ui.confirm).toHaveBeenCalledOnce();
      // The approving double lets the repeated command proceed; only the verified first removal skips the dialog.
      expect(repeated.blocked).toBe(false);

      expect(host.extensionErrors).toEqual([]);
    } finally {
      await host.cleanup(createdDirectory ? [createdDirectory] : []);
    }
  });

  it("supports create and remove commands that carry leading or trailing newlines", async () => {
    const host = await createHost();
    let createdDirectory: string | undefined;

    try {
      // Models routinely emit bash commands with edge newlines; bash ignores them, so this is
      // still the supported standalone creation followed by one direct exact removal.
      const created = await host.runBash("mktemp -d\n");
      expect(created.blocked).toBe(false);
      expect(created.isError).toBe(false);
      createdDirectory = created.text.trim();
      expect(createdDirectory.startsWith("/")).toBe(true);

      const removed = await host.runBash(`\nrm -rf ${createdDirectory}\n`);
      expect(removed.blocked).toBe(false);
      expect(removed.isError).toBe(false);
      await expect(pathExists(createdDirectory)).resolves.toBe(false);
      expect(host.modelRegistry.complete).not.toHaveBeenCalled();
      expect(host.ui.confirm).not.toHaveBeenCalled();

      expect(host.extensionErrors).toEqual([]);
    } finally {
      await host.cleanup(createdDirectory ? [createdDirectory] : []);
    }
  });

  it("requires evaluation and denied approval blocks removal of a replaced tracked directory", async () => {
    const host = await createHost({ approve: false });
    let createdDirectory: string | undefined;

    try {
      const created = await host.runBash("mktemp -d");
      expect(created.blocked).toBe(false);
      createdDirectory = created.text.trim();

      // Replace the tracked directory at the same path, changing its filesystem identity.
      const replaced = await host.runBash(`rmdir ${createdDirectory} && mkdir ${createdDirectory}`);
      expect(replaced.blocked).toBe(false);
      expect(replaced.isError).toBe(false);

      const removal = await host.runBash(`rm -rf ${createdDirectory}`);
      expect(host.modelRegistry.complete).toHaveBeenCalledOnce();
      expect(host.ui.confirm).toHaveBeenCalledOnce();
      expect(removal.blocked).toBe(true);
      expect(removal.blockReason).toBe(DESTRUCTIVE_APPROVAL_REASON);
      await expect(pathExists(createdDirectory)).resolves.toBe(true);

      expect(host.extensionErrors).toEqual([]);
    } finally {
      await host.cleanup(createdDirectory ? [createdDirectory] : []);
    }
  });
});
