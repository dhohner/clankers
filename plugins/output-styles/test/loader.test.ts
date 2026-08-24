import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMMAND_NAME, FLAG_NAME } from "../lib/extension.js";

// The real Pi loader reads the pi.extensions key of package.json, so this suite proves the
// published entry point and the manifest. The other suites drive the plugin through a fake API.
const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));

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
