import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  discoverAndLoadExtensions,
  ExtensionRunner,
  ModelRegistry,
  ModelRuntime,
  SessionManager,
  type ExtensionError,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMMAND_NAME, FLAG_NAME } from "../../src/pi/registration.js";

// Pi reads pi.extensions from package.json and dispatches lifecycle events through its runner.
const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("pi extension loader", () => {
  let cwd: string;
  let agentDir: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "output-styles-cwd-"));
    // getAgentDir() reads this variable, and index.ts calls it while it registers. Without the
    // variable the loader would reach the real agent directory of the developer.
    agentDir = await mkdtemp(join(tmpdir(), "output-styles-agent-"));
    vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
    await rm(agentDir, { recursive: true, force: true });
  });

  it("loads the plugin from its package manifest", async () => {
    const result = await discoverAndLoadExtensions([pluginRoot], cwd, agentDir);

    expect(result.errors).toEqual([]);
    expect(result.extensions.map((extension) => extension.path)).toEqual([join(pluginRoot, "index.ts")]);
  });

  it("applies the bundled flag selection through Pi's session and turn dispatch", async () => {
    const diagnostics = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const loaded = await discoverAndLoadExtensions([pluginRoot], cwd, agentDir);
    expect(loaded.errors).toEqual([]);

    // Explicit paths and disabled refresh keep model setup away from user credentials and the network.
    const models = await ModelRuntime.create({
      authPath: join(agentDir, "auth.json"),
      modelsPath: null,
      modelsStorePath: join(agentDir, "models-cache.json"),
      allowModelNetwork: false,
      refreshOnCreate: false,
    });

    const runner = new ExtensionRunner(
      loaded.extensions,
      loaded.runtime,
      cwd,
      SessionManager.inMemory(cwd),
      new ModelRegistry(models),
    );

    const errors: ExtensionError[] = [];
    runner.onError((error) => errors.push(error));
    runner.setFlagValue(FLAG_NAME, "explanatory");
    runner.setUIContext(undefined, "print");

    await runner.emit({ type: "session_start", reason: "startup" });
    // Supply the complete prompt so Pi does not discover context files from parent directories.
    const systemPrompt = "Host guidance and an earlier extension's instructions.";

    const turn = await runner.emitBeforeAgentStart("Explain this code.", undefined, {
      cwd,
      forceSystemPrompt: systemPrompt,
      contextFiles: [],
      skills: [],
    });

    const asset = await readFile(join(pluginRoot, "styles/explanatory.md"), "utf8");
    const instructions = asset.split("\n---\n")[1].trim();
    expect(instructions).toContain("add short insight notes along the way");
    expect(turn.systemPromptOptions.forceSystemPrompt).toBe(`${systemPrompt}\n\n${instructions}`);
    expect(errors).toEqual([]);
    expect(diagnostics).not.toHaveBeenCalled();
  });

  it("declares the loaded entry point in the package manifest", async () => {
    // The loader falls back to <dir>/index.ts when the manifest declares no usable entry, so the
    // loaded path alone does not prove the manifest. This assertion states the declared value.
    const manifest = JSON.parse(await readFile(join(pluginRoot, "package.json"), "utf8"));
    const declared = manifest.pi.extensions.map((entry: string) => resolve(pluginRoot, entry));

    const result = await discoverAndLoadExtensions([pluginRoot], cwd, agentDir);

    expect(declared).toEqual(result.extensions.map((extension) => extension.path));
  });

  it("registers the command, the flag, and the lifecycle handlers", async () => {
    const result = await discoverAndLoadExtensions([pluginRoot], cwd, agentDir);
    const [extension] = result.extensions;

    expect([...extension.commands.keys()]).toEqualUnordered([COMMAND_NAME]);
    expect([...extension.flags.keys()]).toEqualUnordered([FLAG_NAME]);
    expect([...extension.handlers.keys()]).toEqualUnordered(["session_start", "before_agent_start"]);
  });

  it("registers no shortcut before a session starts", async () => {
    const result = await discoverAndLoadExtensions([pluginRoot], cwd, agentDir);
    const [extension] = result.extensions;

    // The plugin registers the cycle shortcut during session_start, not during registration.
    expect([...extension.shortcuts.keys()]).toEqual([]);
  });
});
