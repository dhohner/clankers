import { describe, expect, it } from "vitest";
import { redactDeep } from "../../src/domain/deep-redaction.ts";

const redact = (text: string) => text.replaceAll("secret", "[redacted:s]");

describe("deep redaction", () => {
  it("redacts strings nested in objects and arrays and returns a new structure", () => {
    const input = {
      messages: [{ role: "user", content: [{ type: "text", text: "the secret" }] }],
      meta: { note: "secret twice secret", count: 2, ok: true, missing: null, undef: undefined },
    };

    const output = redactDeep(input, redact);

    expect(output).toEqual({
      messages: [{ role: "user", content: [{ type: "text", text: "the [redacted:s]" }] }],
      meta: { note: "[redacted:s] twice [redacted:s]", count: 2, ok: true, missing: null, undef: undefined },
    });
    expect(output).not.toBe(input);
    expect(input.meta.note).toBe("secret twice secret");
  });

  it("returns primitives other than strings untouched", () => {
    expect(redactDeep(42, redact)).toBe(42);
    expect(redactDeep(false, redact)).toBe(false);
    expect(redactDeep(null, redact)).toBe(null);
    expect(redactDeep(undefined, redact)).toBe(undefined);
  });

  it("does not follow cycles forever", () => {
    const input: { self?: unknown; text: string } = { text: "secret" };
    input.self = input;

    const output = redactDeep(input, redact) as { self: unknown; text: string };

    expect(output.text).toBe("[redacted:s]");
    expect(output.self).toBe(output);
  });

  it("redacts property names that carry a registered value", () => {
    const input = { arguments: { secret: "x", nested: { "key-secret": ["secret"] } } };

    const output = redactDeep(input, redact);

    expect(output).toEqual({ arguments: { "[redacted:s]": "x", nested: { "key-[redacted:s]": ["[redacted:s]"] } } });
    expect(Object.keys(input.arguments)).toEqual(["secret", "nested"]);
  });

  it("fails instead of merging two property names that redact to the same name", () => {
    const input = { secret: 1, "[redacted:s]": 2 };

    expect(() => redactDeep(input, redact)).toThrow(/duplicate name/);
  });

  it("keeps an own __proto__ property as data without changing the copy's prototype", () => {
    const input = JSON.parse('{"__proto__": {"secret": "secret"}, "text": "secret"}') as Record<string, unknown>;

    const output = redactDeep(input, redact);

    expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
    expect(Object.hasOwn(output, "__proto__")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(output, "__proto__")?.value).toEqual({ "[redacted:s]": "[redacted:s]" });
    expect(output.text).toBe("[redacted:s]");
    expect(redactDeep(input, (text) => text)).toEqual(input);
  });

  it("redacts bytes as UTF-8 text so a value carried in a buffer does not survive serialization", () => {
    const input = { buffer: Buffer.from("the secret"), bytes: new TextEncoder().encode("secret bytes") };

    const output = redactDeep(input, redact);

    expect(output.buffer.toString("utf8")).toBe("the [redacted:s]");
    expect(Buffer.from(output.bytes).toString("utf8")).toBe("[redacted:s] bytes");
    expect(input.buffer.toString("utf8")).toBe("the secret");
    const binary = new Uint8Array([0xff, 0xfe, 1, 2]);
    expect(redactDeep({ binary }, redact).binary).toBe(binary);
  });

  it("replaces an object that defines toJSON with the redacted result of that method", () => {
    class Report {
      toJSON() {
        return { note: "secret", nested: { secret: "secret" } };
      }
    }
    const when = new Date(0);

    const output = redactDeep({ report: new Report(), when }, redact);

    expect(output.report).toEqual({ note: "[redacted:s]", nested: { "[redacted:s]": "[redacted:s]" } });
    expect(output.when).toBe(when.toJSON());
  });

  it("copies a class instance as its redacted enumerable own properties and keeps handles without any", () => {
    class Detail {
      note = "secret";
      count = 1;
      describe() {
        return this.note;
      }
    }

    const map = new Map([["secret", "secret"]]);
    const signal = new AbortController().signal;

    const output = redactDeep({ detail: new Detail(), map, signal }, redact);

    expect(output.detail).toEqual({ note: "[redacted:s]", count: 1 });
    expect(Object.getPrototypeOf(output.detail)).toBe(Object.prototype);
    expect(output.map).toBe(map);
    expect(output.signal).toBe(signal);
  });

  it("fails instead of looping when toJSON returns its own object", () => {
    const cyclic = {
      toJSON() {
        return cyclic;
      },
    };
    Object.setPrototypeOf(cyclic, { marker: true });

    expect(() => redactDeep({ cyclic }, redact)).toThrow(/cycle/);
  });
});
