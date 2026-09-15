import { type RedactionEntry, type RedactionEntrySource, staticEntrySource } from "./credential-registry.ts";
import { isIncompleteReferenceFrom, referenceFor, ValueMatcher } from "./text-redaction.ts";

/**
 * Hold text that may extend into a registered value so matches can cross chunk boundaries.
 * This also preserves the longest match across boundaries.
 *
 * Copy complete references with current ids without scanning their contents.
 * Hold incomplete references so registered values inside them do not rewrite references split across chunks.
 *
 * Treat references with other ids as ordinary text, as `redactText` does.
 * A registered value wins when it is at least as long as the reference it starts.
 *
 * Refresh entries when the source version changes so open streams redact later registrations and pending text.
 * Already released text cannot be recalled.
 *
 * `finish()` releases pending text because the ended stream cannot complete it.
 * `discard()` drops pending text because cancellation may interrupt a credential value.
 */
export class StreamRedactor {
  readonly #source: RedactionEntrySource;
  #matcher: ValueMatcher;
  #version: number;
  #pending = "";
  #closed = false;

  constructor(entries: readonly RedactionEntry[] | RedactionEntrySource) {
    this.#source = Array.isArray(entries) ? staticEntrySource(entries) : (entries as RedactionEntrySource);
    this.#version = this.#source.version;
    this.#matcher = new ValueMatcher(this.#source.redactionEntries());
  }

  push(chunk: string): string {
    if (this.#closed) return "";
    this.#refresh();
    const buffer = this.#pending + chunk;
    const { output, consumed } = this.#scan(buffer, true);
    this.#pending = buffer.slice(consumed);
    return output;
  }

  finish(): string {
    if (this.#closed) return "";
    this.#closed = true;
    this.#refresh();
    const { output } = this.#scan(this.#pending, false);
    this.#pending = "";
    return output;
  }

  discard(): void {
    this.#closed = true;
    this.#pending = "";
  }

  #refresh(): void {
    if (this.#source.version === this.#version) return;
    this.#version = this.#source.version;
    this.#matcher = new ValueMatcher(this.#source.redactionEntries());
  }

  #scan(buffer: string, holdPartial: boolean): { output: string; consumed: number } {
    if (this.#matcher.isEmpty) return { output: buffer, consumed: buffer.length };
    const holdWindow = this.#matcher.longestLength - 1;
    const holdFrom = holdPartial ? Math.max(0, buffer.length - holdWindow) : buffer.length;
    let output = "";
    let copiedUpTo = 0;
    let position = 0;
    while (position < buffer.length) {
      if (position >= holdFrom && this.#matcher.couldExtendFrom(buffer, position)) break;
      if (holdPartial && isIncompleteReferenceFrom(buffer, position)) break;
      const reference = this.#matcher.protectedReferenceLengthAt(buffer, position);
      const match = this.#matcher.matchAt(buffer, position);
      if (match && match.value.length >= reference) {
        output += buffer.slice(copiedUpTo, position) + referenceFor(match.id);
        position += match.value.length;
        copiedUpTo = position;
        continue;
      }
      position += Math.max(1, reference);
    }
    return { output: output + buffer.slice(copiedUpTo, position), consumed: position };
  }
}

export class ByteStreamRedactor {
  readonly #decoder = new TextDecoder("utf-8");
  readonly #text: StreamRedactor;

  constructor(entries: readonly RedactionEntry[] | RedactionEntrySource) {
    this.#text = new StreamRedactor(entries);
  }

  push(bytes: Uint8Array): string {
    return this.#text.push(this.#decoder.decode(bytes, { stream: true }));
  }

  finish(): string {
    return this.#text.push(this.#decoder.decode()) + this.#text.finish();
  }

  discard(): void {
    this.#text.discard();
  }

  pushBytes(bytes: Uint8Array): Buffer {
    return Buffer.from(this.push(bytes), "utf8");
  }

  finishBytes(): Buffer {
    return Buffer.from(this.finish(), "utf8");
  }
}
