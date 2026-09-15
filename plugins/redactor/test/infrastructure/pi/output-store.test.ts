import { readFile, rm } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { type OutputFile, RedactedOutputStore } from "../../../src/infrastructure/pi/output-store.ts";

function recordingFile() {
  const received: string[] = [];
  let closed = 0;
  const file: OutputFile = {
    write: (text) => {
      received.push(text);
    },
    close: () => {
      closed += 1;
    },
  };
  return { file, received, closed: () => closed };
}

describe("redacted output store backpressure", () => {
  it("hands every chunk to the output file before accepting the next, so no output queues in memory", () => {
    const recorder = recordingFile();
    const store = new RedactedOutputStore({ maxLines: 2, maxBytes: 1024, openOutputFile: () => recorder.file });

    store.append("first\n");
    store.append("second\n");
    expect(recorder.received).toEqual([]);
    store.append("third\n");
    expect(recorder.received.join("")).toBe("first\nsecond\nthird\n");
    const large = "x".repeat(200_000);
    store.append(large);
    expect(recorder.received.join("")).toBe(`first\nsecond\nthird\n${large}`);
    expect(store.snapshot().truncation.totalBytes).toBe(Buffer.byteLength(recorder.received.join("")));
  });

  it("surfaces a write failure from append and refuses further output", () => {
    const failure = new Error("ENOSPC: no space left on device");
    const store = new RedactedOutputStore({
      maxLines: 1,
      maxBytes: 1024,
      openOutputFile: () => ({
        write: () => {
          throw failure;
        },
        close: () => undefined,
      }),
    });
    store.append("first\n");

    expect(() => store.append("second\n")).toThrow(failure);
    expect(() => store.append("third\n")).toThrow(/output store is finished/);
  });

  it("closes the file once and rejects close with the close error", async () => {
    const recorder = recordingFile();
    const store = new RedactedOutputStore({ maxLines: 1, maxBytes: 1024, openOutputFile: () => recorder.file });
    store.append("first\nsecond\n");

    await store.close();

    expect(recorder.closed()).toBe(1);
    const failing = new RedactedOutputStore({
      maxLines: 1,
      maxBytes: 1024,
      openOutputFile: () => ({
        write: () => undefined,
        close: () => {
          throw new Error("EIO: close failed");
        },
      }),
    });
    failing.append("first\nsecond\n");
    await expect(failing.close()).rejects.toThrow(/EIO/);
  });

  it("writes the real full-output file synchronously in the temporary directory", async () => {
    const store = new RedactedOutputStore({ maxLines: 1, maxBytes: 1024, filePrefix: "redactor-store-test" });
    store.append("first\n");
    store.append("second\n");
    store.append("third");
    const path = store.fullOutputPath!;

    try {
      expect(await readFile(path, "utf8")).toBe("first\nsecond\nthird");
      await store.close();
      expect(await readFile(path, "utf8")).toBe("first\nsecond\nthird");
    } finally {
      await rm(path, { force: true });
    }
  });
});
