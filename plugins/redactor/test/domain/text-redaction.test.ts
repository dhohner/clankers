import { describe, expect, it } from "vitest";
import {
  isIncompleteReferenceFrom,
  redactCuts,
  MAX_REFERENCE_ID_LENGTH,
  redactText,
  referenceFor,
  referenceLengthAt,
} from "../../src/domain/text-redaction.ts";

const TOKEN = { id: "token", value: "sk-live-0123456789" };
const PASSWORD = { id: "password", value: "hunter2" };

describe("text redaction", () => {
  it("replaces a known value with its reference and keeps unrelated text intact", () => {
    const result = redactText(`export TOKEN=${TOKEN.value} # keep this comment`, [TOKEN]);

    expect(result).toBe(`export TOKEN=${referenceFor("token")} # keep this comment`);
    expect(result).not.toContain(TOKEN.value);
  });

  it("returns text without registered values unchanged, including empty text", () => {
    expect(redactText("nothing to see", [TOKEN, PASSWORD])).toBe("nothing to see");
    expect(redactText("", [TOKEN])).toBe("");
  });

  it("returns the same text when there are no entries", () => {
    expect(redactText(`still ${TOKEN.value}`, [])).toBe(`still ${TOKEN.value}`);
  });

  it("replaces every repeated occurrence, including adjacent ones", () => {
    const result = redactText(`${PASSWORD.value}${PASSWORD.value} and ${PASSWORD.value}`, [PASSWORD]);

    expect(result).toBe(`${referenceFor("password")}${referenceFor("password")} and ${referenceFor("password")}`);
  });

  it("prefers the longest value when one registered value is a prefix of another", () => {
    const short = { id: "short", value: "abc" };
    const long = { id: "long", value: "abcdef" };

    expect(redactText("abcdef abc abcde", [short, long])).toBe(
      `${referenceFor("long")} ${referenceFor("short")} ${referenceFor("short")}de`,
    );
  });

  it("resolves overlapping values leftmost first without leaving either raw", () => {
    const first = { id: "first", value: "abcd" };
    const second = { id: "second", value: "cdef" };

    const result = redactText("abcdef", [first, second]);

    expect(result).toBe(`${referenceFor("first")}ef`);
    expect(result).not.toContain(first.value);
    expect(result).not.toContain(second.value);
  });

  it("keeps the line count of the text when asked to preserve it", () => {
    const multiline = { id: "multi", value: "first\nsecond" };

    const result = redactText(`a ${multiline.value} b`, [multiline], { preserveLineCount: true });

    expect(result).toBe(`a ${referenceFor("multi")}\n b`);
    expect(result.split("\n")).toHaveLength(2);
  });

  it("keeps every line of a value that spans more than two lines when preserving line count", () => {
    const multiline = { id: "multi", value: "one\ntwo\nthree" };

    const result = redactText(`head\n${multiline.value}\ntail`, [multiline], { preserveLineCount: true });

    expect(result).toBe(`head\n${referenceFor("multi")}\n\n\ntail`);
    expect(result.split("\n")).toHaveLength(5);
  });

  it("matches Unicode values exactly, including combining marks and astral characters", () => {
    const unicode = { id: "unicode", value: "pässwörd-🔑-ḱey" };

    const result = redactText(`before ${unicode.value} after ${unicode.value}`, [unicode]);

    expect(result).toBe(`before ${referenceFor("unicode")} after ${referenceFor("unicode")}`);
  });

  it("does not treat a decomposed spelling as the same value", () => {
    const composed = { id: "composed", value: "café" };

    expect(redactText("café", [composed])).toBe("café");
  });

  it("does not match a value that contains regular expression metacharacters loosely", () => {
    const pattern = { id: "pattern", value: "a.c" };

    expect(redactText("abc a.c", [pattern])).toBe(`abc ${referenceFor("pattern")}`);
  });

  it("preserves existing references and never rewrites its own output", () => {
    const reference = referenceFor("token");
    const nested = { id: "nested", value: "redacted" };

    const result = redactText(`${reference} ${TOKEN.value} redacted`, [TOKEN, nested]);

    expect(result).toBe(`${reference} ${reference} ${referenceFor("nested")}`);
  });

  it.each([
    ["the word redacted", { id: "word", value: "redacted" }],
    ["the id", { id: "id", value: "token" }],
    ["a fragment spanning the id and the bracket", { id: "fragment", value: "token]" }],
    ["the opening fragment", { id: "opening", value: "[red" }],
  ])("keeps generated references stable across repeated passes when %s is registered", (_label, entry) => {
    const text = `before ${TOKEN.value} after`;

    const first = redactText(text, [TOKEN, entry]);
    const second = redactText(first, [TOKEN, entry]);
    const third = redactText(second, [TOKEN, entry]);

    expect(first).toBe(`before ${referenceFor("token")} after`);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("lets a registered value win over a reference only when the value extends beyond it", () => {
    const longer = { id: "longer", value: "[redacted:token]-suffix" };
    const shorter = { id: "shorter", value: "[redacted:sho" };

    expect(redactText("[redacted:token]-suffix", [longer])).toBe(referenceFor("longer"));
    expect(redactText("[redacted:shorter] [redacted:sho", [shorter])).toBe(
      `[redacted:shorter] ${referenceFor("shorter")}`,
    );
  });

  it("redacts a registered value wrapped in reference syntax under an id that is not a current reference id", () => {
    const wrapped = `[redacted:${TOKEN.value}]`;
    const foreign = "[redacted:someone-else]";

    expect(redactText(wrapped, [TOKEN])).toBe(`[redacted:${referenceFor("token")}]`);
    expect(redactText(`${foreign} ${wrapped}`, [TOKEN])).toBe(`${foreign} [redacted:${referenceFor("token")}]`);
    expect(redactText(`${referenceFor("token")} ${wrapped}`, [TOKEN])).toBe(
      `${referenceFor("token")} [redacted:${referenceFor("token")}]`,
    );
  });

  it("replaces a registered value that is itself shaped like a reference", () => {
    const shaped = { id: "shaped", value: "[redacted:private-value]" };

    expect(redactText("use [redacted:private-value] now", [shaped])).toBe(`use ${referenceFor("shaped")} now`);
    expect(redactText("[redacted:other] [redacted:private-value]", [shaped, TOKEN])).toBe(
      `[redacted:other] ${referenceFor("shaped")}`,
    );
    expect(redactText(referenceFor("shaped"), [shaped])).toBe(referenceFor("shaped"));
  });

  it("does not treat an incomplete or malformed reference as protected", () => {
    const word = { id: "word", value: "redacted" };

    expect(redactText("[redacted:token", [word])).toBe(`[${referenceFor("word")}:token`);
    expect(redactText("[redacted:]", [word])).toBe(`[${referenceFor("word")}:]`);
    expect(redactText("[redacted:has space]", [word])).toBe(`[${referenceFor("word")}:has space]`);
  });

  it("recognises a complete reference only up to the maximum id length", () => {
    const fitting = referenceFor("a".repeat(MAX_REFERENCE_ID_LENGTH));
    const overlong = referenceFor("a".repeat(MAX_REFERENCE_ID_LENGTH + 1));

    expect(referenceLengthAt(fitting, 0)).toBe(fitting.length);
    expect(referenceLengthAt(overlong, 0)).toBe(0);
    expect(referenceLengthAt(`x${fitting}`, 1)).toBe(fitting.length);
    expect(referenceLengthAt(`x${fitting}`, 0)).toBe(0);
  });

  it("identifies text that could still grow into a reference", () => {
    expect(isIncompleteReferenceFrom("[", 0)).toBe(true);
    expect(isIncompleteReferenceFrom("[redacted:", 0)).toBe(true);
    expect(isIncompleteReferenceFrom("tail [redacted:tok", 5)).toBe(true);
    expect(isIncompleteReferenceFrom("[redacted:token]", 0)).toBe(false);
    expect(isIncompleteReferenceFrom("[redacted:to ken", 0)).toBe(false);
    expect(isIncompleteReferenceFrom("[x", 0)).toBe(false);
    expect(isIncompleteReferenceFrom(`[redacted:${"a".repeat(MAX_REFERENCE_ID_LENGTH + 1)}`, 0)).toBe(false);
  });

  it("produces a reference that carries only the id", () => {
    expect(referenceFor("api-token")).toBe("[redacted:api-token]");
  });
});

describe("cut redaction", () => {
  it("replaces the start of a value left at a cut with its reference", () => {
    const fragment = TOKEN.value.slice(0, 8);
    const text = `key=${fragment}... [truncated]`;

    const result = redactCuts(text, [4 + fragment.length], [TOKEN]);

    expect(result).toBe(`key=${referenceFor("token")}... [truncated]`);
    expect(result).not.toContain(fragment);
  });

  it("finds the longest fragment at a cut when a shorter false start precedes it", () => {
    const repeating = { id: "repeat", value: "abab-secret-value" };
    // The first `ab` is a false start, while the final `abab` reaches the cut.
    const text = "ababab... [truncated]";

    const result = redactCuts(text, [6], [repeating]);

    expect(result).toBe(`ab${referenceFor("repeat")}... [truncated]`);
  });

  it("prefers the longest fragment at a cut even when a longer value starts a shorter one", () => {
    const longerValue = { id: "longer-value", value: "abcXYZWWWWWW" };
    const longerFragment = { id: "longer-fragment", value: "xabcQ" };
    const text = "..xabc... [truncated]";

    const result = redactCuts(text, [6], [longerValue, longerFragment]);

    expect(result).toBe(`..${referenceFor("longer-fragment")}... [truncated]`);
  });

  it("prefers the longest value among those that start the same fragment at a cut", () => {
    const shorter = { id: "shorter", value: "xabcQ" };
    const longer = { id: "longer", value: "xabcQQQQ" };
    const text = "..xabc... [truncated]";

    const result = redactCuts(text, [6], [shorter, longer]);

    expect(result).toBe(`..${referenceFor("longer")}... [truncated]`);
  });

  it("leaves text that does not end in the start of a value unchanged", () => {
    const text = "nothing here... [truncated]";

    expect(redactCuts(text, [text.indexOf("...")], [TOKEN])).toBe(text);
  });

  it("replaces the start of a value at every cut", () => {
    const fragment = TOKEN.value.slice(0, 6);
    const text = `one ${fragment}|two ${fragment}|`;

    const result = redactCuts(text, [4 + fragment.length, text.length - 1], [TOKEN]);

    expect(result).toBe(`one ${referenceFor("token")}|two ${referenceFor("token")}|`);
  });

  it("keeps a complete value already replaced and ignores cuts outside the text", () => {
    const text = `done ${referenceFor("token")}`;

    expect(redactCuts(text, [-1, 0, text.length + 5], [TOKEN])).toBe(text);
  });

  it("returns the text unchanged without cuts or without entries", () => {
    const fragment = `key=${TOKEN.value.slice(0, 8)}`;

    expect(redactCuts(fragment, [], [TOKEN])).toBe(fragment);
    expect(redactCuts(fragment, [fragment.length], [])).toBe(fragment);
  });
});
