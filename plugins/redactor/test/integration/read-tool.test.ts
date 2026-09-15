import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createReadToolDefinition, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { referenceFor } from "../../src/domain/text-redaction.ts";
import { createBashHost } from "../support/bash-host.ts";

const SECRET_HEAD = "sk-live-READTOOL-HEAD-0123456789";
const SECRET_TAIL = "READTOOL-TAIL-9876543210";
/** Span two lines to exercise cuts inside a registered value. */
const SECRET = `${SECRET_HEAD}\n${SECRET_TAIL}`;
const REFERENCE = referenceFor("token");

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function host() {
  const created = await createBashHost();
  cleanups.push(created.cleanup);
  created.registry.register("token", SECRET);
  return created;
}

function lines(count: number, prefix = "line"): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`);
}

describe("redacting read tool (TEST-10 boundaries)", () => {
  it("redacts a value that straddles the line limit before truncation selects the first lines", async () => {
    const h = await host();
    const path = join(h.workingDirectory, "lines.txt");
    await writeFile(path, [...lines(DEFAULT_MAX_LINES - 1), SECRET, ...lines(100, "after")].join("\n"));

    const run = await h.runTool("read", { path });

    expect(run.error).toBeUndefined();
    expect(run.text).not.toContain(SECRET_HEAD);
    expect(run.text).not.toContain(SECRET_TAIL);
    expect(run.text).toContain(`line ${DEFAULT_MAX_LINES - 1}\n${REFERENCE}`);
    expect(run.text).toMatch(/\[Showing lines 1-2000 of 2101\./);
    expect(JSON.stringify(run.raw)).not.toContain(SECRET_HEAD);
  });

  it("redacts a value that straddles a caller-selected line range before the range is cut", async () => {
    const h = await host();
    const path = join(h.workingDirectory, "range.txt");
    await writeFile(path, [...lines(9), SECRET, ...lines(5, "after")].join("\n"));

    const run = await h.runTool("read", { path, offset: 5, limit: 6 });

    expect(run.error).toBeUndefined();
    expect(run.text).not.toContain(SECRET_HEAD);
    expect(run.text).toBe(
      `line 5\nline 6\nline 7\nline 8\nline 9\n${REFERENCE}\n\n[6 more lines in file. Use offset=11 to continue.]`,
    );
  });

  it("redacts a value that straddles the byte limit before truncation cuts it", async () => {
    const h = await host();
    const filler = lines(511).map((line) => line.padEnd(99, "."));
    const tail = `${SECRET_TAIL}${"x".repeat(90)}`;
    h.registry.register("token", `${SECRET_HEAD}\n${tail}`);
    const path = join(h.workingDirectory, "bytes.txt");
    await writeFile(path, [...filler, SECRET_HEAD, tail, ...lines(20, "after")].join("\n"));
    expect(Buffer.byteLength(filler.join("\n"))).toBeLessThan(DEFAULT_MAX_BYTES);

    const run = await h.runTool("read", { path });

    expect(run.error).toBeUndefined();
    expect(run.text).not.toContain(SECRET_HEAD);
    expect(run.text).toContain(`\n${REFERENCE}\n`);
    expect((run.details as { truncation?: { truncated: boolean } } | undefined)?.truncation?.truncated).toBe(true);
  });

  it("keeps original line numbers when a redacted value spans lines", async () => {
    const h = await host();
    const path = join(h.workingDirectory, "offsets.txt");
    await writeFile(path, ["line 1", "line 2", SECRET_HEAD, SECRET_TAIL, "line 5", "line 6"].join("\n"));

    const whole = await h.runTool("read", { path });
    const selected = await h.runTool("read", { path, offset: 5, limit: 2 });

    expect(whole.text).toBe(`line 1\nline 2\n${REFERENCE}\n\nline 5\nline 6`);
    expect(selected.text).toBe("line 5\nline 6");
  });

  it("returns ordinary text, continuation notices, and images exactly like the built-in tool", async () => {
    const h = await host();
    const builtIn = createReadToolDefinition(h.workingDirectory);
    const text = join(h.workingDirectory, "plain.txt");
    await writeFile(text, [...lines(30), "plain [redacted:kept] text"].join("\n"));
    const image = join(h.workingDirectory, "pixel.png");
    await writeFile(
      image,
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
        "base64",
      ),
    );
    const context = { cwd: h.workingDirectory, model: { input: ["text", "image"] } } as never;

    for (const params of [{ path: text }, { path: text, offset: 10, limit: 5 }, { path: image }]) {
      const expected = await builtIn.execute("built-in", params, undefined, undefined, context);
      const run = await h.runTool("read", params);

      expect(run.error).toBeUndefined();
      expect(run.raw).toEqual(expected);
    }
    expect(await readFile(text, "utf8")).toContain("plain [redacted:kept] text");
  });

  it("fails without disclosing the file when redaction fails", async () => {
    const created = await createBashHost({
      algorithms: {
        redactText: (input) => {
          throw new Error(`cannot redact ${input}`);
        },
      },
    });
    cleanups.push(created.cleanup);
    created.registry.register("token", SECRET);
    const path = join(created.workingDirectory, "fail.txt");
    await writeFile(path, `before ${SECRET} after`);

    const run = await created.runTool("read", { path });

    expect(run.error).toBeDefined();
    expect(run.error!.message).toMatch(/redaction failed/);
    expect(run.error!.message).not.toContain("before");
    expect(run.error!.message).not.toContain(SECRET_HEAD);
  });

  it("keeps the built-in read schema and metadata", async () => {
    const h = await host();
    const builtIn = createReadToolDefinition(h.workingDirectory);

    const registered = h.extension.tools.get("read")!.definition;

    expect(registered.name).toBe("read");
    expect(registered.description).toBe(builtIn.description);
    expect(registered.parameters).toEqual(builtIn.parameters);
    expect(registered.promptSnippet).toBe(builtIn.promptSnippet);
  });
});
