import { access, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
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

// `os.tmpdir()` honours TMPDIR, which the extension deliberately does not trust, so a host launched with
// TMPDIR outside the platform roots would put these workspaces where the exception never applies.
const TEMPORARY_ROOT = "/tmp";

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
  const workingDirectory = await mkdtemp(join(TEMPORARY_ROOT, "security-guard-host-cwd-"));
  const agentDirectory = await mkdtemp(join(TEMPORARY_ROOT, "security-guard-host-agent-"));

  const loaded = await discoverAndLoadExtensions([EXTENSION_PACKAGE_DIRECTORY], workingDirectory, agentDirectory);
  expect(loaded.errors).toEqual([]);
  expect(loaded.extensions).toHaveLength(1);

  const modelRegistry = {
    find: vi.fn().mockReturnValue({ provider: "openai", id: "gpt-5.6-luna" }),
    hasConfiguredAuth: vi.fn().mockReturnValue(true),
    complete: vi.fn().mockResolvedValue({
      role: "assistant",
      content: [
        {
          type: "text",
          text: JSON.stringify({ verdict: "unsafe", intent: "Deletes a path", reason: "Removal is permanent" }),
        },
      ],
      stopReason: "stop",
    }),
  };
  const ui = { confirm: vi.fn().mockResolvedValue(approve), setWorkingMessage: vi.fn() };

  const runner = new ExtensionRunner(
    loaded.extensions,
    loaded.runtime,
    workingDirectory,
    {} as never,
    modelRegistry as never,
  );
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

  return { runBash, cleanup, modelRegistry, ui, extensionErrors, workingDirectory };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// Outside every temporary root on any checkout location, and harmless under `rm -rf` because it does not exist.
const EXTERNAL_TARGET = "/nonexistent/security-guard-host-probe";

describe("reported host lifecycle", () => {
  it("runs temporary-workspace cleanup without evaluation or approval", async () => {
    const host = await createHost();
    const probe = join(host.workingDirectory, "lint-parity-probe.tsx");

    try {
      const command = [
        'probe="lint-parity-probe.tsx"',
        `printf '%s\\n' 'temporary probe' > "$probe"`,
        'rm "$probe"',
        "exit 0",
      ].join("\n");
      const result = await host.runBash(command);

      expect(result.blocked).toBe(false);
      expect(result.isError).toBe(false);
      await expect(pathExists(probe)).resolves.toBe(false);
      expect(host.modelRegistry.complete).not.toHaveBeenCalled();
      expect(host.ui.confirm).not.toHaveBeenCalled();
      expect(host.extensionErrors).toEqual([]);
    } finally {
      await host.cleanup();
    }
  });

  it("removes a mktemp -d directory without evaluation or approval, repeatedly", async () => {
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

      // The exception is decided per target, so repeating the removal still needs no evaluation.
      const repeated = await host.runBash(`rm -rf ${createdDirectory}`);
      expect(repeated.blocked).toBe(false);
      expect(host.modelRegistry.complete).not.toHaveBeenCalled();
      expect(host.ui.confirm).not.toHaveBeenCalled();

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
      // still a removal whose only target is inside a temporary root.
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

  it("removes a directory created by mktemp -d in the same call without evaluation or approval", async () => {
    const host = await createHost();

    try {
      const result = await host.runBash('set -e\nd=$(mktemp -d)\ntouch "$d/probe"\nrm -rf "$d"\nprintf \'%s\' "$d"');
      expect(result.blocked).toBe(false);
      expect(result.isError).toBe(false);
      expect(result.text.trim().startsWith("/")).toBe(true);
      await expect(pathExists(result.text.trim())).resolves.toBe(false);
      expect(host.modelRegistry.complete).not.toHaveBeenCalled();
      expect(host.ui.confirm).not.toHaveBeenCalled();
      expect(host.extensionErrors).toEqual([]);
    } finally {
      await host.cleanup();
    }
  });

  it("switches branches with a lone checkout operand no working-tree entry is named like, unattended", async () => {
    const host = await createHost({ approve: false });

    try {
      await writeFile(join(host.workingDirectory, "README.md"), "");

      const unattended = await host.runBash("git checkout main");
      expect(host.modelRegistry.complete).not.toHaveBeenCalled();
      expect(host.ui.confirm).not.toHaveBeenCalled();
      // The workspace is not a repository, so Git itself fails; the guard let the call through.
      expect(unattended.blocked).toBe(false);

      const gated = await host.runBash("git checkout README.md");
      expect(host.modelRegistry.complete).toHaveBeenCalledOnce();
      expect(host.ui.confirm).toHaveBeenCalledOnce();
      expect(gated.blocked).toBe(true);
      expect(gated.blockReason).toBe(DESTRUCTIVE_APPROVAL_REASON);

      expect(host.extensionErrors).toEqual([]);
    } finally {
      await host.cleanup();
    }
  });

  it("requires evaluation and approval when PATH resolves git to a look-alike before a checkout", async () => {
    const host = await createHost({ approve: false });
    const shadow = await mkdtemp(join(TEMPORARY_ROOT, "security-guard-host-shadow-"));

    try {
      await writeFile(join(shadow, "git"), `#!/bin/sh\n/bin/rm -rf "${EXTERNAL_TARGET}"\n`, { mode: 0o755 });
      vi.stubEnv("PATH", `${shadow}:${process.env.PATH ?? ""}`);
      const result = await host.runBash("git checkout main");

      expect(host.modelRegistry.complete).toHaveBeenCalledOnce();
      expect(host.ui.confirm).toHaveBeenCalledOnce();
      expect(result.blocked).toBe(true);
      expect(result.blockReason).toBe(DESTRUCTIVE_APPROVAL_REASON);
      await expect(pathExists(EXTERNAL_TARGET)).resolves.toBe(false);

      expect(host.extensionErrors).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
      await host.cleanup([shadow]);
    }
  });

  it("moves several operands into an existing directory unattended, and asks otherwise", async () => {
    const host = await createHost({ approve: false });

    try {
      await mkdir(join(host.workingDirectory, "src"));
      await Promise.all(["a.ts", "b.ts", "c.ts"].map((file) => writeFile(join(host.workingDirectory, file), "")));

      const gated = await host.runBash("mv a.ts b.ts c.ts d.ts");
      expect(host.modelRegistry.complete).toHaveBeenCalledOnce();
      expect(host.ui.confirm).toHaveBeenCalledOnce();
      expect(gated.blocked).toBe(true);
      expect(gated.blockReason).toBe(DESTRUCTIVE_APPROVAL_REASON);

      const unattended = await host.runBash("mv a.ts b.ts c.ts src/");
      expect(host.modelRegistry.complete).toHaveBeenCalledOnce();
      expect(host.ui.confirm).toHaveBeenCalledOnce();
      expect(unattended.blocked).toBe(false);
      expect(unattended.isError).toBe(false);
      await expect(pathExists(join(host.workingDirectory, "src", "c.ts"))).resolves.toBe(true);
      await expect(pathExists(join(host.workingDirectory, "c.ts"))).resolves.toBe(false);

      expect(host.extensionErrors).toEqual([]);
    } finally {
      await host.cleanup();
    }
  });

  // `env -C /` runs rm from the filesystem root, so the operand the proof resolved inside the workspace is
  // EXTERNAL_TARGET instead. The workspace holds a matching directory, so the proof once granted the
  // exception and bash removed a path far outside it.
  it("blocks a removal whose working directory a wrapper option moves", async () => {
    const host = await createHost({ approve: false });

    try {
      await mkdir(join(host.workingDirectory, "nonexistent"));

      const result = await host.runBash("env -C / rm -rf nonexistent/security-guard-host-probe");
      expect(host.modelRegistry.complete).toHaveBeenCalledOnce();
      expect(host.ui.confirm).toHaveBeenCalledOnce();
      expect(result.blocked).toBe(true);
      expect(result.blockReason).toBe(DESTRUCTIVE_APPROVAL_REASON);
      await expect(pathExists(EXTERNAL_TARGET)).resolves.toBe(false);

      expect(host.extensionErrors).toEqual([]);
    } finally {
      await host.cleanup();
    }
  });

  // `xargs -n 1 rm -rf` once resolved to a command called `1`, so the removal ran with no approval at all.
  it("blocks a removal an xargs option value once hid, leaving the file in place", async () => {
    const host = await createHost({ approve: false });

    try {
      const probe = join(host.workingDirectory, "probe");
      await writeFile(probe, "");

      const result = await host.runBash("printf '%s\\n' probe | xargs -n 1 rm -rf");
      expect(host.modelRegistry.complete).toHaveBeenCalledOnce();
      expect(host.ui.confirm).toHaveBeenCalledOnce();
      expect(result.blocked).toBe(true);
      expect(result.blockReason).toBe(DESTRUCTIVE_APPROVAL_REASON);
      await expect(pathExists(probe)).resolves.toBe(true);

      expect(host.extensionErrors).toEqual([]);
    } finally {
      await host.cleanup();
    }
  });

  // Each of these once let the extension read a shell it never reached: an option list bash rejected, a `set`
  // that ran no builtin, an assignment whose exit status hid a failed mktemp, a `mktemp` prefix that escapes
  // the root, or a command bash assembles from text this policy reads as something else.
  it.each([
    [
      "export reports the builtin's exit status, not the substitution's",
      `set -e; export d=$(mktemp -d); rm -rf "$d/probe"`,
    ],
    ["env runs no shell builtin", `env set -e; d=$(mktemp -d); rm -rf "$d/probe"`],
    ["bash rejects a set call carrying an unknown option letter", `set -eZ; d=$(mktemp -d); rm -rf "$d/probe"`],
    [
      "mktemp -t concatenates its prefix onto the root",
      `set -e; d=$(mktemp -d -t ../security-guard-host-escape); rm -rf "$d"`,
    ],
    ["eval runs its concatenated operands", `eval rm -rf ${EXTERNAL_TARGET}`],
    ["a nested shell reads its script from a variable", `c="rm -rf ${EXTERNAL_TARGET}"; bash -c "$c"`],
    ["a command word comes from a variable", `c="rm -rf ${EXTERNAL_TARGET}"; $c`],
    ["the outer shell expands the nested script", `x="; rm -rf ${EXTERNAL_TARGET}"; bash -c "echo $x"`],
    ["a shell reads its script from standard input", `echo "rm -rf ${EXTERNAL_TARGET}" | bash`],
    ["a shell reads its script from a here-string", `bash <<< "rm -rf ${EXTERNAL_TARGET}"`],
    ["a reserved word introduces the command", `if true; then rm -rf ${EXTERNAL_TARGET}; fi`],
    ["a loop body holds the command", `for f in a; do rm -rf ${EXTERNAL_TARGET}; done`],
    ["brace expansion rewrites the command word", `r{m,} -rf ${EXTERNAL_TARGET}`],
    ["a runner stands in front of the command", `exec rm -rf ${EXTERNAL_TARGET}`],
    ["find removes without running a command", `find . -name security-guard-host-probe -delete`],
    ["chmod takes its mode from an option", `chmod -R -w ${EXTERNAL_TARGET} probe`],
    ["an mv bundle ends at its first value option", `mv -ftS ${EXTERNAL_TARGET} probe`],
    ["a quoted parenthesis does not close a substitution", `echo $(echo ")" ; rm -rf ${EXTERNAL_TARGET})`],
    ["the shell keeps reading options after -c", `bash -co pipefail 'rm -rf ${EXTERNAL_TARGET}'`],
    ["a trap handler runs when the shell exits", `trap 'rm -rf ${EXTERNAL_TARGET}' EXIT`],
    ["a removal command that is not rm", `unlink ${EXTERNAL_TARGET}`],
    ["a Git subcommand that overwrites the working tree", `git restore .`],
  ])("requires evaluation and approval when %s", async (_description, command) => {
    const host = await createHost({ approve: false });

    try {
      const result = await host.runBash(command);
      expect(host.modelRegistry.complete).toHaveBeenCalledOnce();
      expect(host.ui.confirm).toHaveBeenCalledOnce();
      expect(result.blocked).toBe(true);
      expect(result.blockReason).toBe(DESTRUCTIVE_APPROVAL_REASON);

      expect(host.extensionErrors).toEqual([]);
    } finally {
      await host.cleanup();
    }
  });

  // `path.resolve` collapsed `link/..` to the link's own parent, so a removal the kernel resolves to the
  // link target's parent was proven to stay inside the workspace. `/etc` stands in for the escape target;
  // nothing is removed, because the call is blocked before it runs.
  it("blocks a removal that leaves the workspace through a symlink", async () => {
    const host = await createHost({ approve: false });

    try {
      await symlink("/etc", join(host.workingDirectory, "link"));

      const result = await host.runBash("rm -rf link/../hosts");
      expect(host.modelRegistry.complete).toHaveBeenCalledOnce();
      expect(host.ui.confirm).toHaveBeenCalledOnce();
      expect(result.blocked).toBe(true);
      expect(result.blockReason).toBe(DESTRUCTIVE_APPROVAL_REASON);
      await expect(pathExists("/etc/hosts")).resolves.toBe(true);

      expect(host.extensionErrors).toEqual([]);
    } finally {
      await host.cleanup();
    }
  });

  it("requires evaluation and denied approval blocks removal of an external target from a temporary workspace", async () => {
    const host = await createHost({ approve: false });

    try {
      const removal = await host.runBash(`rm -rf ${EXTERNAL_TARGET}`);
      expect(host.modelRegistry.complete).toHaveBeenCalledOnce();
      expect(host.ui.confirm).toHaveBeenCalledOnce();
      expect(removal.blocked).toBe(true);
      expect(removal.blockReason).toBe(DESTRUCTIVE_APPROVAL_REASON);

      expect(host.extensionErrors).toEqual([]);
    } finally {
      await host.cleanup();
    }
  });

  // Each of these once reached the temporary-workspace exception although bash would have removed or
  // clobbered EXTERNAL_TARGET. The target stays non-existent, so a regression blocks rather than deletes.
  it.each([
    [
      "a conditional assignment leaves the earlier value",
      `d=/nonexistent; false && d=$(mktemp -d); rm -rf "$d/security-guard-host-probe"`,
    ],
    [
      "a subshell assignment does not reach this shell",
      `d=/nonexistent; (d=$(mktemp -d)); rm -rf "$d/security-guard-host-probe"`,
    ],
    [
      "printf -v reassigns the proven variable",
      `d=$(mktemp -d); printf -v d /nonexistent; rm -rf "$d/security-guard-host-probe"`,
    ],
    ["TMPDIR moves where mktemp -d creates", `export TMPDIR=/nonexistent; d=$(mktemp -d); rm -rf "$d"`],
    ["a redirection writes a path no operand names", `rm -rf probe; echo x > ${EXTERNAL_TARGET}`],
    ["a quoted substitution assigns its own text", `d='$(mktemp -d)'; rm -rf "$d"`],
    ["touch creates a path outside the workspace", `rm -rf probe; touch ${EXTERNAL_TARGET}`],
    ["mkdir creates a path outside the workspace", `rm -rf probe; mkdir ${EXTERNAL_TARGET}`],
    ["a leading redirection precedes the command word", `>probe.log rm -rf ${EXTERNAL_TARGET}`],
    ["a wrapper option takes a value", `nice -n 10 rm -rf ${EXTERNAL_TARGET}`],
    [
      "mktemp -d carries an option that may make it fail",
      `d=$(mktemp -d --definitely-invalid); rm -rf "$d${EXTERNAL_TARGET}"`,
    ],
    ["a wrapper option writes a file of its own", `/usr/bin/time -o ${EXTERNAL_TARGET} rm -rf probe`],
    // `mktemp -d -t` fails for want of a prefix, so bash passes the suffix on its own from the root.
    [
      "a failed mktemp leaves an empty variable",
      `d=$(mktemp -d -t)\nrm -rf "$d/nonexistent/security-guard-host-probe"`,
    ],
    ["an xargs option takes a value", `printf '%s\\n' ${EXTERNAL_TARGET} | xargs -n 1 rm -rf`],
  ])("requires evaluation and approval when %s", async (_description, command) => {
    const host = await createHost({ approve: false });

    try {
      const result = await host.runBash(command);
      expect(host.modelRegistry.complete).toHaveBeenCalledOnce();
      expect(host.ui.confirm).toHaveBeenCalledOnce();
      expect(result.blocked).toBe(true);
      expect(result.blockReason).toBe(DESTRUCTIVE_APPROVAL_REASON);
      await expect(pathExists(EXTERNAL_TARGET)).resolves.toBe(false);

      expect(host.extensionErrors).toEqual([]);
    } finally {
      await host.cleanup();
    }
  });

  it("requires evaluation and approval when an unquoted expansion splits into several operands", async () => {
    const host = await createHost({ approve: false });

    try {
      // The unsplit word names one path inside the workspace, so only word splitting reaches the
      // external operand; the joined directory exists to make the unsplit reading resolvable.
      await mkdir(join(host.workingDirectory, `probe ${EXTERNAL_TARGET}`), { recursive: true });
      const result = await host.runBash(`p="probe ${EXTERNAL_TARGET}"; rm -rf $p`);

      expect(host.modelRegistry.complete).toHaveBeenCalledOnce();
      expect(host.ui.confirm).toHaveBeenCalledOnce();
      expect(result.blocked).toBe(true);
      expect(result.blockReason).toBe(DESTRUCTIVE_APPROVAL_REASON);
      await expect(pathExists(EXTERNAL_TARGET)).resolves.toBe(false);

      expect(host.extensionErrors).toEqual([]);
    } finally {
      await host.cleanup();
    }
  });

  it("requires evaluation and approval when the command word names a look-alike executable", async () => {
    const host = await createHost({ approve: false });

    try {
      // Only the basename and the local operand once qualified this call, although the executable the
      // agent wrote is what actually runs.
      const lookAlike = join(host.workingDirectory, "rm");
      await writeFile(lookAlike, `#!/bin/sh\n/bin/rm -rf "${EXTERNAL_TARGET}"\n`, { mode: 0o755 });
      const result = await host.runBash("./rm probe");

      expect(host.modelRegistry.complete).toHaveBeenCalledOnce();
      expect(host.ui.confirm).toHaveBeenCalledOnce();
      expect(result.blocked).toBe(true);
      expect(result.blockReason).toBe(DESTRUCTIVE_APPROVAL_REASON);
      await expect(pathExists(EXTERNAL_TARGET)).resolves.toBe(false);

      expect(host.extensionErrors).toEqual([]);
    } finally {
      await host.cleanup();
    }
  });

  it("requires evaluation and approval when PATH resolves the command word to a look-alike", async () => {
    const host = await createHost({ approve: false });
    const shadow = await mkdtemp(join(TEMPORARY_ROOT, "security-guard-host-shadow-"));

    try {
      // The bare word and the local operand qualify on their own, but the host's PATH decides which `rm`
      // runs, and here it is one the agent wrote.
      await writeFile(join(shadow, "rm"), `#!/bin/sh\n/bin/rm -rf "${EXTERNAL_TARGET}"\n`, { mode: 0o755 });
      vi.stubEnv("PATH", `${shadow}:${process.env.PATH ?? ""}`);
      const result = await host.runBash("rm probe");

      expect(host.modelRegistry.complete).toHaveBeenCalledOnce();
      expect(host.ui.confirm).toHaveBeenCalledOnce();
      expect(result.blocked).toBe(true);
      expect(result.blockReason).toBe(DESTRUCTIVE_APPROVAL_REASON);
      await expect(pathExists(EXTERNAL_TARGET)).resolves.toBe(false);

      expect(host.extensionErrors).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
      await host.cleanup([shadow]);
    }
  });

  it("requires evaluation and approval when PATH resolves mktemp in an assignment to a look-alike", async () => {
    const host = await createHost({ approve: false });
    const shadow = await mkdtemp(join(TEMPORARY_ROOT, "security-guard-host-shadow-"));

    try {
      // The assignment reads as a fresh temporary directory, but the `mktemp` the host's PATH provides
      // returns whatever directory it likes, and the real `rm` then removes it.
      await writeFile(join(shadow, "mktemp"), `#!/bin/sh\nprintf '%s\\n' "${EXTERNAL_TARGET}"\n`, { mode: 0o755 });
      vi.stubEnv("PATH", `${shadow}:${process.env.PATH ?? ""}`);
      const result = await host.runBash('set -e\nd=$(mktemp -d)\nrm -rf "$d"');

      expect(host.modelRegistry.complete).toHaveBeenCalledOnce();
      expect(host.ui.confirm).toHaveBeenCalledOnce();
      expect(result.blocked).toBe(true);
      expect(result.blockReason).toBe(DESTRUCTIVE_APPROVAL_REASON);
      await expect(pathExists(EXTERNAL_TARGET)).resolves.toBe(false);

      expect(host.extensionErrors).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
      await host.cleanup([shadow]);
    }
  });

  it("requires evaluation and approval when an inherited BASH_ENV can redefine the command", async () => {
    const host = await createHost({ approve: false });
    const startup = await mkdtemp(join(TEMPORARY_ROOT, "security-guard-host-startup-"));

    try {
      // A non-interactive bash sources BASH_ENV before the command, so a function named `rm` defined there
      // runs in place of the system executable PATH resolution found.
      const startupFile = join(startup, "bash_env");
      await writeFile(startupFile, `rm() { /bin/rm -rf "${EXTERNAL_TARGET}"; }\n`);
      vi.stubEnv("BASH_ENV", startupFile);
      const result = await host.runBash("rm probe");

      expect(host.modelRegistry.complete).toHaveBeenCalledOnce();
      expect(host.ui.confirm).toHaveBeenCalledOnce();
      expect(result.blocked).toBe(true);
      expect(result.blockReason).toBe(DESTRUCTIVE_APPROVAL_REASON);
      await expect(pathExists(EXTERNAL_TARGET)).resolves.toBe(false);

      expect(host.extensionErrors).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
      await host.cleanup([startup]);
    }
  });

  it("runs an approved external removal only after one evaluation and one approval", async () => {
    const host = await createHost();

    try {
      const removal = await host.runBash(`rm -rf lint-parity-probe.tsx ${EXTERNAL_TARGET}`);
      expect(host.modelRegistry.complete).toHaveBeenCalledOnce();
      expect(host.ui.confirm).toHaveBeenCalledOnce();
      expect(removal.blocked).toBe(false);
      expect(removal.isError).toBe(false);

      expect(host.extensionErrors).toEqual([]);
    } finally {
      await host.cleanup();
    }
  });
});
