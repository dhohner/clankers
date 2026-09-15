import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DefaultResourceLoader,
  discoverAndLoadExtensions,
  ExtensionRunner,
  type ExtensionError,
  type ExtensionFactory,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UNSUPPORTED_PLATFORM_MESSAGE } from "../../src/domain/warning.ts";
import { createRedactorExtension, PROTECTED_EVENTS } from "../../src/extension.ts";

const PACKAGE_DIRECTORY = fileURLToPath(new URL("../..", import.meta.url));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function temporaryDirectories() {
  const workingDirectory = await mkdtemp(join(tmpdir(), "redactor-host-cwd-"));
  const agentDirectory = await mkdtemp(join(tmpdir(), "redactor-host-agent-"));
  cleanups.push(async () => {
    await Promise.all([workingDirectory, agentDirectory].map((path) => rm(path, { recursive: true, force: true })));
  });
  return { workingDirectory, agentDirectory };
}

// Use the public `DefaultResourceLoader` path to match package initialization while injecting the platform test seam.
async function loadInline(factory: ExtensionFactory, workingDirectory: string, agentDirectory: string) {
  const loader = new DefaultResourceLoader({
    cwd: workingDirectory,
    agentDir: agentDirectory,
    settingsManager: SettingsManager.inMemory(),
    extensionFactories: [{ name: "redactor", factory }],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await loader.reload();
  const result = loader.getExtensions();
  expect(result.errors).toEqual([]);
  expect(result.extensions).toHaveLength(1);
  return { extension: result.extensions[0]!, runtime: result.runtime };
}

function createUi() {
  return { notify: vi.fn(), setWorkingMessage: vi.fn(), confirm: vi.fn(), select: vi.fn(), input: vi.fn() };
}

describe("host loading (TEST-01)", () => {
  it("loads the package through the real extension loader without Security Guard and registers the protected paths", async () => {
    const { workingDirectory, agentDirectory } = await temporaryDirectories();

    const loaded = await discoverAndLoadExtensions([PACKAGE_DIRECTORY], workingDirectory, agentDirectory);

    expect(loaded.errors).toEqual([]);
    expect(loaded.extensions).toHaveLength(1);
    const [extension] = loaded.extensions;
    expect(extension!.resolvedPath).toContain("plugins/redactor/");
    expect(extension!.resolvedPath).not.toContain("security-guard");
    expect([...extension!.tools.keys()]).toEqual(["bash", "read"]);
    for (const event of PROTECTED_EVENTS) {
      expect(extension!.handlers.get(event)?.length ?? 0).toBeGreaterThan(0);
    }
    // Verify the extension leaves excluded user `!` commands untouched.
    expect(extension!.handlers.has("user_bash")).toBe(false);
  });

  it("does not expose a model-callable registration tool", async () => {
    const { workingDirectory, agentDirectory } = await temporaryDirectories();

    const loaded = await discoverAndLoadExtensions([PACKAGE_DIRECTORY], workingDirectory, agentDirectory);

    const toolNames = [...loaded.extensions[0]!.tools.keys()];
    expect(toolNames.filter((name) => /regist|credential|secret/i.test(name))).toEqual([]);
    expect(loaded.extensions[0]!.commands.size).toBe(0);
  });

  it("reports an unsupported platform clearly and activates no protection paths there", async () => {
    const { workingDirectory, agentDirectory } = await temporaryDirectories();
    const { extension, runtime } = await loadInline(
      createRedactorExtension({ platform: "linux" }),
      workingDirectory,
      agentDirectory,
    );
    const errors: ExtensionError[] = [];
    const runner = new ExtensionRunner([extension], runtime, workingDirectory, {} as never, {} as never);
    runner.onError((error) => errors.push(error));
    const ui = createUi();
    runner.setUIContext(ui as never, "tui");

    await runner.emit({ type: "session_start", reason: "startup" });

    expect(ui.notify).toHaveBeenCalledWith(UNSUPPORTED_PLATFORM_MESSAGE, "warning");
    expect(extension.tools.size).toBe(0);
    for (const event of PROTECTED_EVENTS) {
      expect(extension.handlers.has(event)).toBe(false);
    }
    expect(errors).toEqual([]);
  });

  it("shows the load-time warning wrapped to the reported terminal width on a supported platform", async () => {
    const { workingDirectory, agentDirectory } = await temporaryDirectories();
    const { extension, runtime } = await loadInline(
      createRedactorExtension({ platform: "darwin", terminalWidth: () => 40 }),
      workingDirectory,
      agentDirectory,
    );
    const runner = new ExtensionRunner([extension], runtime, workingDirectory, {} as never, {} as never);
    const ui = createUi();
    runner.setUIContext(ui as never, "tui");

    await runner.emit({ type: "session_start", reason: "startup" });

    expect(ui.notify).toHaveBeenCalledTimes(1);
    const [message, level] = ui.notify.mock.calls[0]!;
    expect(level).toBe("warning");
    const lines = String(message).split("\n");
    expect(lines.length).toBeGreaterThan(5);
    expect(lines.every((line) => line.length <= 40)).toBe(true);
    expect(String(message)).toMatch(/not a sandbox/);
    expect(String(message)).toMatch(/`!` commands/);
  });
});
