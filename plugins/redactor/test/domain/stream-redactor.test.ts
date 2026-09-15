import { describe, expect, it } from "vitest";
import { CredentialRegistry } from "../../src/domain/credential-registry.ts";
import { ByteStreamRedactor, StreamRedactor } from "../../src/domain/stream-redactor.ts";
import { referenceFor } from "../../src/domain/text-redaction.ts";

const SECRET = { id: "secret", value: "sk-live-ABCDEFGH-01" };
const REFERENCE = referenceFor("secret");

function collect(stream: StreamRedactor, chunks: readonly string[]): { emitted: string[]; final: string } {
  const emitted = chunks.map((chunk) => stream.push(chunk));
  return { emitted, final: emitted.join("") + stream.finish() };
}

describe("stream redactor", () => {
  it("redacts a value registered after the stream opened, including text still pending from earlier chunks", () => {
    const registry = new CredentialRegistry();
    registry.register("secret", SECRET.value);
    const stream = new StreamRedactor(registry);
    const late = { id: "late", value: "ghp_LATE_9876543210" };

    const first = stream.push(`a ${late.value.slice(0, 5)}`);
    registry.register(late.id, late.value);
    const second = stream.push(`${late.value.slice(5)} b ${late.value} c ${SECRET.value.slice(0, 3)}`);
    const third = stream.push(`${SECRET.value.slice(3)} d`);
    const final = first + second + third + stream.finish();

    expect(first).toBe(`a ${late.value.slice(0, 5)}`);
    expect(second).toBe(`${late.value.slice(5)} b ${referenceFor("late")} c `);
    expect(final).toBe(`a ${late.value.slice(0, 5)}${late.value.slice(5)} b ${referenceFor("late")} c ${REFERENCE} d`);
  });

  it("holds back text that only became a possible prefix through a later registration", () => {
    const registry = new CredentialRegistry();
    const stream = new StreamRedactor(registry);
    const late = { id: "late", value: "ghp_LATE_9876543210" };

    expect(stream.push("x ")).toBe("x ");
    registry.register(late.id, late.value);
    expect(stream.push(late.value.slice(0, 4))).toBe("");
    expect(stream.push(late.value.slice(4))).toBe(referenceFor("late"));
    expect(stream.finish()).toBe("");
  });

  const splitPositions = Array.from({ length: SECRET.value.length + 1 }, (_, index) => index);

  it.each(splitPositions)("redacts a value split after %d characters and holds back the partial prefix", (split) => {
    const stream = new StreamRedactor([SECRET]);
    const first = `before ${SECRET.value.slice(0, split)}`;
    const second = `${SECRET.value.slice(split)} after`;

    const { emitted, final } = collect(stream, [first, second]);

    expect(final).toBe(`before ${REFERENCE} after`);
    expect(emitted[0]).toBe(split === SECRET.value.length ? `before ${REFERENCE}` : "before ");
    expect(final).not.toContain(SECRET.value);
  });

  it("redacts a value delivered one character at a time", () => {
    const stream = new StreamRedactor([SECRET]);
    const chunks = [...`x${SECRET.value}y${SECRET.value}`];

    const { emitted, final } = collect(stream, chunks);

    expect(final).toBe(`x${REFERENCE}y${REFERENCE}`);
    expect(emitted.slice(0, SECRET.value.length).join("")).toBe("x");
  });

  it("flushes an incomplete final chunk that is only a prefix of a value", () => {
    const stream = new StreamRedactor([SECRET]);
    const partial = SECRET.value.slice(0, 5);

    const { emitted, final } = collect(stream, [`tail ${partial}`]);

    expect(emitted[0]).toBe("tail ");
    expect(final).toBe(`tail ${partial}`);
  });

  it("does not emit a held-back partial value after the stream is discarded", () => {
    const stream = new StreamRedactor([SECRET]);
    const partial = SECRET.value.slice(0, 9);

    const emitted = stream.push(`out ${partial}`);
    stream.discard();

    expect(emitted).toBe("out ");
    expect(stream.finish()).toBe("");
    expect(stream.push("more")).toBe("");
  });

  it("prefers the longer value even when the shorter one completes in an earlier chunk", () => {
    const short = { id: "short", value: "abc" };
    const long = { id: "long", value: "abcdef" };
    const stream = new StreamRedactor([short, long]);

    const { emitted, final } = collect(stream, ["xabc", "def", " abc", "x"]);

    expect(emitted[0]).toBe("x");
    expect(final).toBe(`x${referenceFor("long")} ${referenceFor("short")}x`);
  });

  it("resolves overlapping values across chunks leftmost first", () => {
    const first = { id: "first", value: "abcd" };
    const second = { id: "second", value: "cdef" };
    const stream = new StreamRedactor([first, second]);

    const { final } = collect(stream, ["ab", "cd", "ef"]);

    expect(final).toBe(`${referenceFor("first")}ef`);
  });

  it("keeps unrelated text and existing references intact across chunks", () => {
    const stream = new StreamRedactor([SECRET]);

    const { final } = collect(stream, ["plain [redac", "ted:secret] text sk-live", "-other"]);

    expect(final).toBe("plain [redacted:secret] text sk-live-other");
  });

  it("holds a reference split across chunks instead of rewriting it when the word itself is registered", () => {
    const word = { id: "word", value: "redacted" };
    const stream = new StreamRedactor([SECRET, word]);

    const { emitted, final } = collect(stream, ["see [redacted:se", "cret] and redacted ", SECRET.value]);

    expect(emitted[0]).toBe("see ");
    expect(final).toBe(`see ${REFERENCE} and ${referenceFor("word")} ${REFERENCE}`);
  });

  it("replaces a reference-shaped registered value at every split position", () => {
    const shaped = { id: "shaped", value: "[redacted:private-value]" };

    for (let split = 0; split <= shaped.value.length; split += 1) {
      const stream = new StreamRedactor([shaped, SECRET]);
      const { emitted, final } = collect(stream, [
        `a ${shaped.value.slice(0, split)}`,
        `${shaped.value.slice(split)} b`,
      ]);

      expect(final, `split ${split}`).toBe(`a ${referenceFor("shaped")} b`);
      for (const part of emitted) expect(part, `split ${split}`).not.toContain("private");
    }
  });

  it("redacts a value wrapped in reference syntax under a foreign id at every split position", () => {
    const wrapped = `[redacted:${SECRET.value}]`;

    for (let split = 0; split <= wrapped.length; split += 1) {
      const stream = new StreamRedactor([SECRET]);
      const { emitted, final } = collect(stream, [`a ${wrapped.slice(0, split)}`, `${wrapped.slice(split)} b`]);

      expect(final, `split ${split}`).toBe(`a [redacted:${REFERENCE}] b`);
      for (const part of emitted) expect(part, `split ${split}`).not.toContain(SECRET.value);
    }
  });

  it("keeps a reference stable when the stream is fed its own output again", () => {
    const word = { id: "word", value: "redacted" };
    const first = collect(new StreamRedactor([SECRET, word]), [`x ${SECRET.value.slice(0, 4)}`, SECRET.value.slice(4)]);

    const second = collect(new StreamRedactor([SECRET, word]), [first.final.slice(0, 7), first.final.slice(7)]);

    expect(first.final).toBe(`x ${REFERENCE}`);
    expect(second.final).toBe(first.final);
  });

  it("releases an incomplete reference at the end of the stream", () => {
    const word = { id: "word", value: "redacted" };
    const stream = new StreamRedactor([word]);

    const { emitted, final } = collect(stream, ["tail [redacted:unfinished"]);

    expect(emitted[0]).toBe("tail ");
    expect(final).toBe(`tail [${referenceFor("word")}:unfinished`);
  });

  it("emits nothing for an empty stream", () => {
    const stream = new StreamRedactor([SECRET]);

    expect(stream.push("")).toBe("");
    expect(stream.finish()).toBe("");
  });

  it("passes text through untouched when nothing is registered", () => {
    const stream = new StreamRedactor([]);

    expect(collect(stream, ["a", SECRET.value, "b"]).final).toBe(`a${SECRET.value}b`);
  });

  it("keeps two streams independent when their chunks interleave", () => {
    const one = new StreamRedactor([SECRET]);
    const two = new StreamRedactor([SECRET]);

    const oneFirst = one.push(`one ${SECRET.value.slice(0, 6)}`);
    const twoFirst = two.push(`two ${SECRET.value.slice(0, 3)}`);
    const oneFinal = oneFirst + one.push(SECRET.value.slice(6)) + one.finish();
    const twoFinal = twoFirst + two.push(SECRET.value.slice(3)) + two.finish();

    expect(oneFinal).toBe(`one ${REFERENCE}`);
    expect(twoFinal).toBe(`two ${REFERENCE}`);
  });
});

describe("byte stream redactor", () => {
  const unicode = { id: "unicode", value: "pässwörd-🔑" };
  const encoded = Buffer.from(`echo ${unicode.value} done`, "utf8");

  it.each(Array.from({ length: encoded.length + 1 }, (_, index) => index))(
    "redacts across a byte split at offset %d, including inside multi-byte sequences",
    (offset) => {
      const stream = new ByteStreamRedactor([unicode]);

      const text = stream.push(encoded.subarray(0, offset)) + stream.push(encoded.subarray(offset)) + stream.finish();

      expect(text).toBe(`echo ${referenceFor("unicode")} done`);
    },
  );

  it("returns UTF-8 bytes so downstream byte accounting keeps working", () => {
    const stream = new ByteStreamRedactor([unicode]);

    const output = Buffer.concat([stream.pushBytes(encoded), stream.finishBytes()]);

    expect(output.toString("utf8")).toBe(`echo ${referenceFor("unicode")} done`);
  });

  it("never emits a value registered under another id while replacing a credential", () => {
    const registry = new CredentialRegistry();
    registry.register("first", "sk-live-FIRST-0123");
    registry.register("second", referenceFor("first"));
    const stream = new StreamRedactor(registry);

    const output = stream.push("sk-live-FIRST-0123") + stream.finish();

    expect(output).not.toContain("sk-live-FIRST-0123");
    expect(output).not.toContain(referenceFor("first"));
  });

  it("drops held-back bytes on discard", () => {
    const stream = new ByteStreamRedactor([unicode]);

    const emitted = stream.push(Buffer.from("say pässw", "utf8"));
    stream.discard();

    expect(emitted).toBe("say ");
    expect(stream.finish()).toBe("");
  });
});
