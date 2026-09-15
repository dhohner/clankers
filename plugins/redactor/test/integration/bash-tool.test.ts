import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { inspect } from "node:util";
import { createBashToolDefinition } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { ByteStreamRedactor } from "../../src/domain/stream-redactor.ts";
import { referenceFor } from "../../src/domain/text-redaction.ts";
import { createBashHost } from "../support/bash-host.ts";
import { PARK, release, waitFor, waitUntilParked } from "../support/handshake.ts";

const SECRET = "sk-live-BASHTOOL-0123456789";
const OTHER = "ghp_OTHERTOKEN_9876543210";
const REFERENCE = referenceFor("token");
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

async function writeProjectPrefix(directory: string, prefix: string): Promise<void> {
  await mkdir(join(directory, ".pi"), { recursive: true });
  await writeFile(join(directory, ".pi", "settings.json"), JSON.stringify({ shellCommandPrefix: prefix }));
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

describe("redacting bash tool through the real runner (TEST-10, TEST-11, regression)", () => {
  it("redacts a secret split across stdout chunks before every published update and the final result", async () => {
    const h = await host();
    const head = SECRET.slice(0, 9);
    const tail = SECRET.slice(9);

    const run = await h.runBash(`printf '%s' 'out ${head}'; sleep 0.1; printf '%s\\n' '${tail} end'`);

    expect(run.error).toBeUndefined();
    expect(run.text).toBe(`out ${REFERENCE} end\n`);
    for (const update of run.updates) expectNoRawValue(update.text, SECRET, head);
    expect(h.extensionErrors).toEqual([]);
  });

  it("redacts a value registered while the command is still streaming, in updates, the result, and the output file", async () => {
    const h = await host();
    await writeFile(join(h.workingDirectory, "late.txt"), OTHER);

    const pending = h.runBash(
      `echo phase-one; ${PARK}; s=$(cat late.txt); for i in $(seq 1 2500); do echo "line $i $s"; done`,
    );
    await waitUntilParked(h.workingDirectory);
    h.registry.register("other", OTHER);
    await release(h.workingDirectory);
    const run = await pending;

    expect(run.error).toBeUndefined();
    expect(run.text).toContain(`line 2500 ${referenceFor("other")}`);
    expectNoRawValue(run.text, OTHER);
    for (const update of run.updates) expectNoRawValue(update.text, OTHER);
    const details = run.details as { fullOutputPath?: string };
    expect(details.fullOutputPath).toBeDefined();
    const fullOutput = await readFile(details.fullOutputPath!, "utf8");
    expect(fullOutput).toContain("phase-one");
    expectNoRawValue(fullOutput, OTHER);
  });

  it("applies the shell command prefix from the project settings of a trusted project's working directory", async () => {
    const h = await host({ projectTrusted: true });
    await writeProjectPrefix(h.workingDirectory, "echo prefix-marker");

    const run = await h.runBash("echo body-marker");

    expect(run.error).toBeUndefined();
    expect(run.text).toBe("prefix-marker\nbody-marker\n");
  });

  it("runs nothing and reports a fixed failure when the project settings are locked, instead of dropping the prefix", async () => {
    const h = await host({ projectTrusted: true });
    await writeProjectPrefix(h.workingDirectory, "echo prefix-marker");
    // Create the lock directory because `proper-lockfile` treats it as a held lock.
    await mkdir(join(h.workingDirectory, ".pi", "settings.json.lock"));
    const marker = join(h.workingDirectory, "executed");

    const run = await h.runBash("touch executed; echo body-marker");

    expect(run.error).toBeDefined();
    expect(run.error!.message).toBe("redactor: the shell settings could not be loaded; the command was not run");
    expectNoRawValue(inspectWithoutStack(run.error), "prefix-marker", "settings.json");
    await expect(pathExists(marker)).resolves.toBe(false);
    expect(run.updates).toEqual([]);
  });

  it("ignores the project shell settings of an untrusted project, like the built-in tool", async () => {
    const h = await host({ projectTrusted: false });
    await writeProjectPrefix(h.workingDirectory, "echo planted-prefix");

    const run = await h.runBash("echo body-marker");

    expect(run.error).toBeUndefined();
    expect(run.text).toBe("body-marker\n");
  });

  it("redacts stderr as well as stdout", async () => {
    const h = await host();

    const run = await h.runBash("cat secret.txt 1>&2; echo; echo visible");

    expect(run.error).toBeUndefined();
    expect(run.text).toContain(REFERENCE);
    expect(run.text).toContain("visible");
    expectNoRawValue(run.text, SECRET);
  });

  it("keeps the exit status in the error while redacting the echoed output", async () => {
    const h = await host();

    const run = await h.runBash("cat secret.txt; exit 3");

    expect(run.error).toBeDefined();
    expect(run.error!.message).toContain("Command exited with code 3");
    expect(run.error!.message).toContain(REFERENCE);
    expectNoRawValue(run.error!.message, SECRET);
  });

  it("redacts output beyond the truncation limits, the truncation metadata, and the controlled output file", async () => {
    const h = await host();

    const run = await h.runBash('s=$(cat secret.txt); for i in $(seq 1 2500); do echo "line $i $s"; done');

    expect(run.error).toBeUndefined();
    const details = run.details as { truncation?: { truncated: boolean; totalLines: number }; fullOutputPath?: string };
    expect(details.truncation?.truncated).toBe(true);
    expect(details.truncation?.totalLines).toBe(2500);
    expect(run.text).toMatch(/\[Showing lines \d+-2500 of 2500/);
    expectNoRawValue(run.text, SECRET);
    expect(run.text).toContain(`line 2500 ${REFERENCE}`);
    for (const update of run.updates) {
      expectNoRawValue(update.text, SECRET);
      expectNoRawValue(JSON.stringify(update.details ?? null), SECRET);
    }
    expect(details.fullOutputPath).toBeDefined();
    const fullOutput = await readFile(details.fullOutputPath!, "utf8");
    expectNoRawValue(fullOutput, SECRET);
    expect(fullOutput.split("\n").filter((line) => line.includes(REFERENCE))).toHaveLength(2500);
    expect(fullOutput).toContain("line 1 ");
  });

  it("leaves unrelated text and existing references exactly as printed", async () => {
    const h = await host();

    const run = await h.runBash(`printf '%s\\n' 'plain ${REFERENCE} text sk-live-not-registered'`);

    expect(run.text).toBe(`plain ${REFERENCE} text sk-live-not-registered\n`);
  });

  it("keeps concurrent tool streams isolated", async () => {
    const h = await host();
    h.registry.register("other", OTHER);
    const [aHead, aTail] = [SECRET.slice(0, 7), SECRET.slice(7)];
    const [bHead, bTail] = [OTHER.slice(0, 5), OTHER.slice(5)];

    const [a, b] = await Promise.all([
      h.runBash(`printf 'A:${aHead}'; sleep 0.15; printf '%s\\n' '${aTail}:A'`),
      h.runBash(`printf 'B:${bHead}'; sleep 0.05; printf '%s\\n' '${bTail}:B'`),
    ]);

    expect(a.text).toBe(`A:${REFERENCE}:A\n`);
    expect(b.text).toBe(`B:${referenceFor("other")}:B\n`);
    expect(a.text).not.toContain("B:");
    expect(b.text).not.toContain("A:");
    for (const update of [...a.updates, ...b.updates]) expectNoRawValue(update.text, SECRET, OTHER);
  });

  it("does not flush a held-back partial value when the command is cancelled", async () => {
    const h = await host();
    const partial = SECRET.slice(0, 12);
    const controller = new AbortController();
    const published: string[] = [];

    const pending = h.runBash(`printf '%s' 'visible ${partial}'; sleep 30`, controller.signal, (update) => {
      published.push(update.text);
    });
    // Wait for published text to prove the redactor processed the chunk.
    // A marker would prove only that Bash wrote the output.
    await waitFor(() => published.some((text) => text.includes("visible")), "no output was published");
    controller.abort();
    const run = await pending;

    expect(run.error).toBeDefined();
    expect(run.error!.message).toContain("Command aborted");
    expect(run.error!.message).toContain("visible");
    expectNoRawValue(run.error!.message, partial);
    for (const update of run.updates) expectNoRawValue(update.text, partial);
  });

  it("runs nothing when redaction cannot be set up before execution", async () => {
    const h = await host({
      algorithms: {
        createByteStream: () => {
          throw new Error(`cannot open stream for ${SECRET}`);
        },
      },
    });
    const marker = join(h.workingDirectory, "executed");

    const run = await h.runBash("touch executed; cat secret.txt");

    expect(run.error).toBeDefined();
    expect(run.error!.message).toMatch(/redaction failed/);
    expectNoRawValue(run.error!.message, SECRET, "touch executed");
    await expect(pathExists(marker)).resolves.toBe(false);
    expect(run.updates.map((update) => update.text).join("")).toBe("");
  });

  it("stops disclosure with a sanitized error when redaction fails mid-stream and does not rerun the command", async () => {
    let pushes = 0;
    const h = await host({
      algorithms: {
        createByteStream: (entries) => {
          const inner = new ByteStreamRedactor(entries);
          return {
            push: (bytes: Uint8Array) => {
              pushes += 1;
              if (pushes === 2) throw new Error(`stream broke on ${SECRET}`);
              return inner.push(bytes);
            },
            finish: () => inner.finish(),
            discard: () => inner.discard(),
          } as ByteStreamRedactor;
        },
      },
    });

    const run = await h.runBash(
      `echo started >> runs; echo first; sleep 0.1; cat secret.txt; echo; sleep 0.1; echo ${LATE_OUTPUT}`,
    );

    expect(run.error).toBeDefined();
    expect(run.error!.message).toMatch(/redaction failed/);
    expectNoRawValue(run.error!.message, SECRET, LATE_OUTPUT);
    expectNoRawValue(inspectWithoutStack(run.error), SECRET, LATE_OUTPUT);
    for (const update of run.updates) expectNoRawValue(update.text, SECRET);
    const runs = await readFile(join(h.workingDirectory, "runs"), "utf8");
    expect(runs.trim().split("\n")).toHaveLength(1);
  });

  it("preserves the built-in bash schema, label, description, and prompt metadata", async () => {
    const h = await host();
    const builtIn = createBashToolDefinition(h.workingDirectory);

    const registered = h.extension.tools.get("bash")!.definition;

    expect(registered.name).toBe("bash");
    expect(registered.label).toBe(builtIn.label);
    expect(registered.description).toBe(builtIn.description);
    expect(registered.parameters).toEqual(builtIn.parameters);
    expect(registered.promptSnippet).toBe(builtIn.promptSnippet);
    expect(registered.promptGuidelines).toEqual(builtIn.promptGuidelines);
  });

  it("returns ordinary output untouched with no truncation metadata", async () => {
    const h = await host();

    const run = await h.runBash("echo hello; echo world");

    expect(run.error).toBeUndefined();
    expect(run.text).toBe("hello\nworld\n");
    expect(run.details).toBeUndefined();
  });
});
