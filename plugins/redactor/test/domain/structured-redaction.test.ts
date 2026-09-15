import { describe, expect, it } from "vitest";
import { redactDeep } from "../../src/domain/deep-redaction.ts";
import {
  array,
  data,
  identifier,
  lazy,
  object,
  oneOf,
  redactByShape,
  type Shape,
  variants,
} from "../../src/domain/structured-redaction.ts";

const REDACTED = "[redacted:s]";
const redactText = (text: string) => text.replaceAll("secret", REDACTED);
const redactValue = <V>(value: V): V => redactDeep(value, redactText);

describe("shape-driven redaction", () => {
  it("redacts names and values deeply at a data position", () => {
    const shape = object({ input: data });

    const output = redactByShape({ input: { secret: "secret", nested: ["secret", 1] } }, shape, redactValue);

    expect(output).toEqual({ input: { [REDACTED]: REDACTED, nested: [REDACTED, 1] } });
  });

  it("keeps primitives at an identifier position and treats a structure there as data", () => {
    const shape = object({ role: identifier, count: identifier, flag: identifier, odd: identifier });

    const output = redactByShape(
      { role: "secret", count: 2, flag: true, odd: { secret: "secret" } },
      shape,
      redactValue,
    );

    expect(output).toEqual({ role: "secret", count: 2, flag: true, odd: { [REDACTED]: REDACTED } });
  });

  it("keeps known property names, redacts unknown names and their values, and copies nothing else", () => {
    const shape = object({ secret: data, nested: object({ id: identifier }) });
    const input = { secret: "secret", nested: { id: "secret", other: "secret" }, "extra secret": "secret" };

    const output = redactByShape(input, shape, redactValue);

    expect(output).toEqual({
      secret: REDACTED,
      nested: { id: "secret", other: REDACTED },
      [`extra ${REDACTED}`]: REDACTED,
    });
    expect(output).not.toBe(input);
    expect(input.nested.other).toBe("secret");
  });

  it("keeps unknown names when the rest shape says so, and still applies the rest shape to their values", () => {
    const shape = object({}, { names: "keep", shape: object({ type: identifier }) });

    const output = redactByShape({ secret: { type: "secret", text: "secret" } }, shape, redactValue);

    expect(output).toEqual({ secret: { type: "secret", text: REDACTED } });
  });

  it("treats a non-object at an object position and a non-array at an array position as data", () => {
    const shape = object({ content: array(object({ type: identifier })), meta: object({ id: identifier }) });

    const output = redactByShape({ content: "secret", meta: ["secret"] }, shape, redactValue);

    expect(output).toEqual({ content: REDACTED, meta: [REDACTED] });
  });

  it("applies the item shape to every array element", () => {
    const shape = array(object({ type: identifier, text: data }));

    const output = redactByShape([{ type: "secret", text: "secret" }, "secret", 3], shape, redactValue);

    expect(output).toEqual([{ type: "secret", text: REDACTED }, REDACTED, 3]);
  });

  it("selects a variant by its discriminant, keeps the discriminant, and falls back for unknown ones", () => {
    const shape = variants("type", {
      text: object({ text: data }),
      call: object({ name: identifier, input: data }),
    });
    const input = [
      { type: "text", text: "secret" },
      { type: "call", name: "secret", input: { secret: 1 } },
      { type: "secret", text: "secret" },
      { type: 7, text: "secret" },
      "secret",
    ];

    const output = redactByShape(input, array(shape), redactValue);

    expect(output).toEqual([
      { type: "text", text: REDACTED },
      { type: "call", name: "secret", input: { [REDACTED]: 1 } },
      { type: REDACTED, text: REDACTED },
      { type: 7, text: REDACTED },
      REDACTED,
    ]);
  });

  it("uses the fallback shape for an unknown discriminant", () => {
    const shape = variants("role", { user: object({ content: data }) }, object({ role: identifier }));

    const output = redactByShape({ role: "secret", content: "secret" }, shape, redactValue);

    expect(output).toEqual({ role: "secret", content: REDACTED });
  });

  it("picks the first alternative that fits the runtime type", () => {
    const shape = object({
      content: oneOf(identifier, array(object({ type: identifier })), object({ id: identifier })),
    });

    expect(redactByShape({ content: "secret" }, shape, redactValue)).toEqual({ content: "secret" });
    expect(redactByShape({ content: [{ type: "secret" }] }, shape, redactValue)).toEqual({
      content: [{ type: "secret" }],
    });
    expect(redactByShape({ content: { id: "secret" } }, shape, redactValue)).toEqual({ content: { id: "secret" } });
    expect(redactByShape({ content: null }, shape, redactValue)).toEqual({ content: null });
  });

  it("resolves a lazy shape, which allows recursive schemas", () => {
    const schema: Shape = lazy(() =>
      object({ type: identifier, items: schema, properties: object({}, { names: "keep", shape: schema }) }),
    );

    const output = redactByShape(
      { type: "secret", items: { type: "secret", title: "secret" }, properties: { secret: { type: "secret" } } },
      schema,
      redactValue,
    );

    expect(output).toEqual({
      type: "secret",
      items: { type: "secret", title: REDACTED },
      properties: { secret: { type: "secret" } },
    });
  });

  it("fails on a cycle through structural positions instead of recursing forever", () => {
    const shape: Shape = lazy(() => object({ next: shape }));
    const input: { next?: unknown } = {};
    input.next = input;

    expect(() => redactByShape(input, shape, redactValue)).toThrow(/cycle/);
  });

  it("fails instead of merging two unknown names that redact to the same name", () => {
    const shape = object({});

    expect(() => redactByShape({ secret: 1, [REDACTED]: 2 }, shape, redactValue)).toThrow(/duplicate name/);
  });

  it("keeps an own __proto__ property as data without changing the copy's prototype", () => {
    const input = JSON.parse('{"__proto__": {"secret": "secret"}, "type": "secret"}') as Record<string, unknown>;

    const output = redactByShape(input, object({ type: identifier }), redactValue);

    expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(output, "__proto__")?.value).toEqual({ [REDACTED]: REDACTED });
    expect(output.type).toBe("secret");
  });

  it("returns values that carry no text, such as bytes and signals, as they are", () => {
    const bytes = new Uint8Array([1, 2]);
    const signal = new AbortController().signal;

    const output = redactByShape({ bytes, signal }, object({ bytes: data, signal: data }), redactValue);

    expect(output.bytes).toBe(bytes);
    expect(output.signal).toBe(signal);
  });
});
