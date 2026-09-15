import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { inspect } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { referenceFor } from "../../src/domain/text-redaction.ts";
import { createBashHost } from "../support/bash-host.ts";
import { PARK, release, waitUntilParked } from "../support/handshake.ts";

const SECRET = "sk-live-BASHTOOL-0123456789";
const OTHER = "ghp_OTHERTOKEN_9876543210";
/** Use a unique post failure sentinel to detect output without matching checkout paths. */
const LATE_OUTPUT = "late-output-never-published-0c4e";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function host(options?: Parameters<typeof createBashHost>[0]) {
  const created = await createBashHost(options);
  cleanups.push(created.cleanup);
  created.registry.register("token", SECRET);
  await writeFile(join(created.workingDirectory, "secret.txt"), SECRET);
  return created;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function expectNoRawValue(text: string, ...raw: string[]): void {
  for (const value of raw) expect(text).not.toContain(value);
}

/** Remove stack frames because checkout paths cannot contain command output. */
function inspectWithoutStack(error: unknown): string {
  return inspect(error, { depth: 10 })
    .split("\n")
    .filter((line) => !/^\s+at /.test(line))
    .join("\n");
}

/** Set `TMPDIR` for one run because `os.tmpdir()` reads it. */
async function withTemporaryDirectory<T>(directory: string, run: () => Promise<T>): Promise<T> {
  const previous = process.env.TMPDIR;
  process.env.TMPDIR = directory;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
  }
}

describe("redacting bash tool output path (TEST-11)", () => {
  it("runs nothing and reports a sanitized failure when the output file path contains a registered value", async () => {
    const h = await host();
    const marker = join(h.workingDirectory, "executed");
    const directory = join(h.workingDirectory, `tmp-${SECRET}`);
    await mkdir(directory);

    const run = await withTemporaryDirectory(directory, () => h.runBash("touch executed; seq 1 3000"));

    expect(run.error).toBeDefined();
    expect(run.error!.message).toMatch(/storing redacted output failed/);
    expectNoRawValue(run.error!.message, SECRET, "tmp-");
    expectNoRawValue(inspectWithoutStack(run.error), SECRET, "tmp-");
    await expect(pathExists(marker)).resolves.toBe(false);
    expect(run.updates).toEqual([]);
  });

  it("stops the command with a sanitized failure when a value registered mid-run appears in the output file path", async () => {
    const h = await host();
    const directory = join(h.workingDirectory, `tmp-${OTHER}`);
    await mkdir(directory);

    const run = await withTemporaryDirectory(directory, async () => {
      const running = h.runBash(`echo started >> runs; echo first; ${PARK}; seq 1 3000; echo ${LATE_OUTPUT}`);
      await waitUntilParked(h.workingDirectory);
      h.registry.register("other", OTHER);
      await release(h.workingDirectory);
      return running;
    });

    expect(run.error).toBeDefined();
    expect(run.error!.message).toMatch(/storing redacted output failed/);
    expectNoRawValue(run.error!.message, OTHER, LATE_OUTPUT);
    expectNoRawValue(inspectWithoutStack(run.error), OTHER, LATE_OUTPUT);
    expectNoRawValue(JSON.stringify(run.updates.map((update) => update.raw)), OTHER, LATE_OUTPUT);
    const runs = await readFile(join(h.workingDirectory, "runs"), "utf8");
    expect(runs.trim().split("\n")).toHaveLength(1);
  });

  it("publishes no registered value through any field of an update or the result when output is stored in a file", async () => {
    const h = await host();

    const run = await h.runBash('s=$(cat secret.txt); for i in $(seq 1 2500); do echo "line $i $s"; done');

    expect(run.error).toBeUndefined();
    expect(run.updates.length).toBeGreaterThan(0);
    expectNoRawValue(JSON.stringify(run.updates.map((update) => update.raw)), SECRET);
    expectNoRawValue(JSON.stringify(run.raw), SECRET);
    expect(run.text).toContain("Full output: ");
    expect((run.details as { fullOutputPath: string }).fullOutputPath).not.toContain("[redacted:");
  });

  it("redacts a reference-shaped registered value split across chunks", async () => {
    const h = await host();
    const shaped = "[redacted:private-value]";
    h.registry.register("shaped", shaped);

    const run = await h.runBash(
      `printf '%s' 'see ${shaped.slice(0, 12)}'; sleep 0.1; printf '%s\\n' '${shaped.slice(12)} end'`,
    );

    expect(run.error).toBeUndefined();
    expect(run.text).toBe(`see ${referenceFor("shaped")} end\n`);
    for (const update of run.updates) expectNoRawValue(update.text, "private");
  });
});

describe("redacting bash tool output storage directory (TEST-11)", () => {
  it("runs nothing and reports a sanitized failure when the output directory is missing before the command starts", async () => {
    const h = await host();
    const marker = join(h.workingDirectory, "executed");
    const missing = join(h.workingDirectory, `missing-${SECRET}`);

    const run = await withTemporaryDirectory(missing, () => h.runBash("touch executed; cat secret.txt"));

    expect(run.error).toBeDefined();
    expect(run.error!.message).toMatch(/storing redacted output failed/);
    expectNoRawValue(run.error!.message, SECRET, "missing-");
    expectNoRawValue(inspectWithoutStack(run.error), SECRET, "missing-");
    await expect(pathExists(marker)).resolves.toBe(false);
    expect(run.updates.map((update) => update.text).join("")).toBe("");
  });

  it("stops the command with a sanitized failure when the output directory disappears before the output file is needed", async () => {
    const h = await host();
    const directory = join(h.workingDirectory, "tmp-vanishing");
    await mkdir(directory);

    const pending = withTemporaryDirectory(directory, async () => {
      const running = h.runBash(`echo started >> runs; echo first; ${PARK}; seq 1 3000; echo ${LATE_OUTPUT}`);
      await waitUntilParked(h.workingDirectory);
      await rm(directory, { recursive: true, force: true });
      await release(h.workingDirectory);
      return running;
    });
    const run = await pending;

    expect(run.error).toBeDefined();
    expect(run.error!.message).toMatch(/storing redacted output failed/);
    expectNoRawValue(run.error!.message, SECRET, "tmp-", LATE_OUTPUT);
    expectNoRawValue(inspectWithoutStack(run.error), SECRET, "tmp-", LATE_OUTPUT);
    for (const update of run.updates) expectNoRawValue(update.text, SECRET);
    const runs = await readFile(join(h.workingDirectory, "runs"), "utf8");
    expect(runs.trim().split("\n")).toHaveLength(1);
  });
});

function failingOutputFile(failOnWrite: number, secret: string) {
  let writes = 0;
  const written: string[] = [];
  const openOutputFile = () => ({
    write: (text: string) => {
      writes += 1;
      if (writes === failOnWrite) throw new Error(`ENOSPC: no space left on device, write ${secret}`);
      written.push(text);
    },
    close: () => undefined,
  });
  return { openOutputFile, written };
}

describe("redacting bash tool output file (TEST-11)", () => {
  it("stops the process with a sanitized failure when the output file fails while output is streaming", async () => {
    const file = failingOutputFile(2, SECRET);
    const h = await createBashHost({ openOutputFile: file.openOutputFile });
    cleanups.push(h.cleanup);
    h.registry.register("token", SECRET);
    await writeFile(join(h.workingDirectory, "secret.txt"), SECRET);
    const startedAt = Date.now();

    const run = await h.runBash(
      `echo started >> runs; s=$(cat secret.txt); for i in $(seq 1 2500); do echo "line $i $s"; done; sleep 30; echo ${LATE_OUTPUT}`,
    );

    expect(run.error).toBeDefined();
    expect(run.error!.message).toMatch(/storing redacted output failed/);
    expectNoRawValue(run.error!.message, SECRET, "ENOSPC", LATE_OUTPUT, "line 1");
    expectNoRawValue(inspectWithoutStack(run.error), SECRET, "ENOSPC", LATE_OUTPUT);
    for (const update of run.updates) expectNoRawValue(update.text, SECRET, LATE_OUTPUT);
    expectNoRawValue(file.written.join(""), SECRET);
    expect(Date.now() - startedAt).toBeLessThan(10_000);
    const runs = await readFile(join(h.workingDirectory, "runs"), "utf8");
    expect(runs.trim().split("\n")).toHaveLength(1);
    expect(h.extensionErrors).toEqual([]);
  });

  it("reports a sanitized failure instead of a result when the output file fails while closing", async () => {
    let ended = 0;
    const openOutputFile = () => ({
      write: () => undefined,
      close: () => {
        ended += 1;
        throw new Error(`EIO: flush failed for ${SECRET}`);
      },
    });
    const h = await createBashHost({ openOutputFile });
    cleanups.push(h.cleanup);
    h.registry.register("token", SECRET);
    await writeFile(join(h.workingDirectory, "secret.txt"), SECRET);

    const run = await h.runBash('s=$(cat secret.txt); for i in $(seq 1 2500); do echo "line $i $s"; done');

    expect(ended).toBe(1);
    expect(run.error).toBeDefined();
    expect(run.error!.message).toMatch(/storing redacted output failed/);
    expectNoRawValue(run.error!.message, SECRET, "EIO", "line 2500");
    expectNoRawValue(inspectWithoutStack(run.error), SECRET, "EIO");
    expect(h.extensionErrors).toEqual([]);
  });

  it("exposes the session to commands through PI_* variables like the built-in tool", async () => {
    const h = await host();

    const run = await h.runBash('echo "$PI_SESSION_ID"; echo "${PI_SESSION_FILE:-unset}"');

    expect(run.error).toBeUndefined();
    expect(run.text).toBe("redactor-bash-host\nunset\n");
  });
});
