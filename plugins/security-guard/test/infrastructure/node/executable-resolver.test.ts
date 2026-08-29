import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allSystemExecutables,
  inheritedShellStartupIsInert,
  resolvesToSystemExecutable,
} from "../../../src/infrastructure/node/executable-resolver.js";

const TEMPORARY_ROOT = "/tmp";
const SYSTEM_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";

const cleanups: Array<() => Promise<unknown>> = [];

async function makeDirectory(): Promise<string> {
  const directory = await mkdtemp(join(TEMPORARY_ROOT, "security-guard-executables-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe("system executable resolution", () => {
  it("accepts a name the system directories provide first", async () => {
    vi.stubEnv("PATH", SYSTEM_PATH);
    await expect(resolvesToSystemExecutable("rm", "/")).resolves.toBe(true);
    await expect(allSystemExecutables(["rm", "chmod", "diff"], "/")).resolves.toBe(true);
    await expect(allSystemExecutables([], "/")).resolves.toBe(true);
  });

  it.each([
    ["BASH_ENV", "/Users/example/.bash_env"],
    ["ENV", "/Users/example/.shrc"],
    ["BASH_FUNC_rm%%", "() { :; }"],
  ])("rejects every name when the inherited %s can define functions first", async (name, value) => {
    vi.stubEnv("PATH", SYSTEM_PATH);
    vi.stubEnv(name, value);

    expect(inheritedShellStartupIsInert()).toBe(false);
    await expect(resolvesToSystemExecutable("rm", "/")).resolves.toBe(false);
    await expect(allSystemExecutables(["rm"], "/")).resolves.toBe(false);
    await expect(allSystemExecutables([], "/")).resolves.toBe(false);
  });

  it("rejects a look-alike that an earlier PATH entry provides", async () => {
    const shadow = await makeDirectory();
    await writeFile(join(shadow, "rm"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    vi.stubEnv("PATH", `${shadow}:${SYSTEM_PATH}`);

    await expect(resolvesToSystemExecutable("rm", "/")).resolves.toBe(false);
    await expect(allSystemExecutables(["chmod", "rm"], "/")).resolves.toBe(false);
    await expect(resolvesToSystemExecutable("chmod", "/")).resolves.toBe(true);
  });

  it("skips an entry whose file bash would not run", async () => {
    const shadow = await makeDirectory();
    await writeFile(join(shadow, "rm"), "", { mode: 0o644 });
    vi.stubEnv("PATH", `${shadow}:${SYSTEM_PATH}`);

    await expect(resolvesToSystemExecutable("rm", "/")).resolves.toBe(true);
  });

  it("follows a link in an earlier entry to wherever it points", async () => {
    const shadow = await makeDirectory();
    await symlink("/bin/rm", join(shadow, "rm"));
    await writeFile(join(shadow, "chmod"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    await symlink(join(shadow, "chmod"), join(shadow, "chown"));
    vi.stubEnv("PATH", `${shadow}:${SYSTEM_PATH}`);

    await expect(resolvesToSystemExecutable("rm", "/")).resolves.toBe(true);
    await expect(resolvesToSystemExecutable("chown", "/")).resolves.toBe(false);
  });

  it("searches a relative or empty entry from the working directory", async () => {
    const cwd = await makeDirectory();
    await writeFile(join(cwd, "rm"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });

    vi.stubEnv("PATH", `:${SYSTEM_PATH}`);
    await expect(resolvesToSystemExecutable("rm", cwd)).resolves.toBe(false);
    await expect(resolvesToSystemExecutable("rm", "/")).resolves.toBe(true);

    vi.stubEnv("PATH", `.:${SYSTEM_PATH}`);
    await expect(resolvesToSystemExecutable("rm", cwd)).resolves.toBe(false);
  });

  it("rejects a name no entry provides, an unset PATH, and an unusable working directory", async () => {
    vi.stubEnv("PATH", SYSTEM_PATH);
    await expect(resolvesToSystemExecutable("security-guard-missing-command", "/")).resolves.toBe(false);
    await expect(resolvesToSystemExecutable("", "/")).resolves.toBe(false);
    await expect(resolvesToSystemExecutable("/bin/rm", "/")).resolves.toBe(false);
    await expect(resolvesToSystemExecutable("rm", undefined)).resolves.toBe(false);
    await expect(resolvesToSystemExecutable("rm", "relative")).resolves.toBe(false);

    vi.stubEnv("PATH", undefined);
    await expect(resolvesToSystemExecutable("rm", "/")).resolves.toBe(false);
  });

  it("searches the Pi agent bin directory before PATH", async () => {
    const agentDirectory = await makeDirectory();
    await mkdir(join(agentDirectory, "bin"));
    await writeFile(join(agentDirectory, "bin", "rm"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    vi.stubEnv("PI_CODING_AGENT_DIR", agentDirectory);
    vi.stubEnv("PATH", SYSTEM_PATH);

    await expect(resolvesToSystemExecutable("rm", "/")).resolves.toBe(false);
    await expect(resolvesToSystemExecutable("chmod", "/")).resolves.toBe(true);
  });
});
