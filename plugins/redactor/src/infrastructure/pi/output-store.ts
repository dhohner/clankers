import { randomBytes } from "node:crypto";
import { closeSync, openSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  type TruncationResult,
  truncateTail,
} from "@earendil-works/pi-coding-agent";

/**
 * `write` returns after handing bytes to the operating system.
 * Both methods throw so callers see failures during the responsible append or close operation.
 */
export interface OutputFile {
  write(text: string): void;
  close(): void;
}

export interface OutputStoreOptions {
  maxLines?: number;
  maxBytes?: number;
  filePrefix?: string;
  /** Tests inject this function to observe writes and simulate failures. Production uses a synchronous file. */
  openOutputFile?: (path: string) => OutputFile;
}

export interface OutputSnapshot {
  content: string;
  truncation: TruncationResult;
  fullOutputPath: string | undefined;
}

/**
 * Write synchronously because the host accumulator queues stream writes without a bound.
 * Backpressure keeps a fast process from filling memory when file writes are slow.
 * End the store after open, write, or close failures so callers never publish a result for an incomplete file.
 */
export class RedactedOutputStore {
  readonly #maxLines: number;
  readonly #maxBytes: number;
  readonly #maxRollingBytes: number;
  readonly #filePrefix: string;
  readonly #openOutputFile: (path: string) => OutputFile;

  #pendingChunks: string[] = [];
  #tail = "";
  #tailBytes = 0;
  #tailStartsAtLineBoundary = true;
  #totalBytes = 0;
  #completedLines = 0;
  #currentLineBytes = 0;
  #hasOpenLine = false;
  #finished = false;
  readonly #filePath: string;
  #file: OutputFile | undefined;

  constructor(options: OutputStoreOptions) {
    this.#maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
    this.#maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.#maxRollingBytes = Math.max(this.#maxBytes * 2, 1);
    this.#filePrefix = options.filePrefix ?? "redactor-output";
    this.#openOutputFile = options.openOutputFile ?? openSynchronousFile;
    this.#filePath = join(tmpdir(), `${this.#filePrefix}-${randomBytes(8).toString("hex")}.log`);
  }

  get totalLines(): number {
    return this.#completedLines + (this.#hasOpenLine ? 1 : 0);
  }

  get lastLineBytes(): number {
    return this.#currentLineBytes;
  }

  get fullOutputPath(): string | undefined {
    return this.#file ? this.#filePath : undefined;
  }

  get plannedOutputPath(): string {
    return this.#filePath;
  }

  append(text: string): void {
    if (this.#finished) throw new Error("output store is finished");
    if (text.length === 0) return;
    this.#track(text);
    if (!this.#file && !this.#needsFile()) {
      this.#pendingChunks.push(text);
      return;
    }
    try {
      this.#ensureFile();
      this.#file!.write(text);
    } catch (error) {
      this.#finished = true;
      throw error;
    }
  }

  snapshot(): OutputSnapshot {
    const tail = truncateTail(this.#snapshotText(), { maxLines: this.#maxLines, maxBytes: this.#maxBytes });
    const truncated = this.totalLines > this.#maxLines || this.#totalBytes > this.#maxBytes;
    const truncatedBy = truncated
      ? (tail.truncatedBy ?? (this.#totalBytes > this.#maxBytes ? "bytes" : "lines"))
      : null;
    return {
      content: tail.content,
      truncation: {
        ...tail,
        truncated,
        truncatedBy,
        totalLines: this.totalLines,
        totalBytes: this.#totalBytes,
        maxLines: this.#maxLines,
        maxBytes: this.#maxBytes,
      },
      fullOutputPath: this.fullOutputPath,
    };
  }

  async close(): Promise<void> {
    this.#finished = true;
    const file = this.#file;
    if (!file) return;
    this.#file = undefined;
    file.close();
  }

  #needsFile(): boolean {
    return this.#totalBytes > this.#maxBytes || this.totalLines > this.#maxLines;
  }

  #ensureFile(): void {
    if (this.#file) return;
    const file = this.#openOutputFile(this.#filePath);
    this.#file = file;
    for (const chunk of this.#pendingChunks) file.write(chunk);
    this.#pendingChunks = [];
  }

  #track(text: string): void {
    const bytes = Buffer.byteLength(text, "utf8");
    this.#totalBytes += bytes;
    this.#tail += text;
    this.#tailBytes += bytes;
    if (this.#tailBytes > this.#maxRollingBytes * 2) this.#trimTail();
    let newlines = 0;
    let lastNewline = -1;
    for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) {
      newlines += 1;
      lastNewline = index;
    }
    if (newlines === 0) {
      this.#currentLineBytes += bytes;
      this.#hasOpenLine = true;
      return;
    }
    this.#completedLines += newlines;
    const open = text.slice(lastNewline + 1);
    this.#currentLineBytes = Buffer.byteLength(open, "utf8");
    this.#hasOpenLine = open.length > 0;
  }

  #trimTail(): void {
    const buffer = Buffer.from(this.#tail, "utf8");
    if (buffer.length <= this.#maxRollingBytes) {
      this.#tailBytes = buffer.length;
      return;
    }
    let start = buffer.length - this.#maxRollingBytes;
    while (start < buffer.length && (buffer[start]! & 0xc0) === 0x80) start += 1;
    this.#tailStartsAtLineBoundary = start === 0 ? this.#tailStartsAtLineBoundary : buffer[start - 1] === 0x0a;
    this.#tail = buffer.subarray(start).toString("utf8");
    this.#tailBytes = Buffer.byteLength(this.#tail, "utf8");
  }

  #snapshotText(): string {
    if (this.#tailStartsAtLineBoundary) return this.#tail;
    const firstNewline = this.#tail.indexOf("\n");
    return firstNewline === -1 ? this.#tail : this.#tail.slice(firstNewline + 1);
  }
}

function openSynchronousFile(path: string): OutputFile {
  const descriptor = openSync(path, "w");
  return {
    write: (text) => {
      const bytes = Buffer.from(text, "utf8");
      // Repeat writes because one call may accept only part of the buffer.
      for (let offset = 0; offset < bytes.length;) {
        offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
      }
    },
    close: () => closeSync(descriptor),
  };
}
