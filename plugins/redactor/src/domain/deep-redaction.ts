/**
 * Property names can contain credentials, such as a tool argument keyed by a credential value.
 * Throw on a redacted name collision because choosing either entry would drop data.
 *
 * Objects that are not plain are redacted in the form JSON serialization gives them, because the session file and
 * provider payloads carry that form: bytes are decoded as UTF-8 text and replaced only when they change, a `toJSON`
 * result replaces its object, and any other object with enumerable own properties is copied as those properties.
 */
export function redactDeep<T>(value: T, redact: (text: string) => string): T {
  return visit(value, redact, new Map()) as T;
}

/** A `seen` entry without a value marks an object whose `toJSON` result is still being visited. */
function visit(value: unknown, redact: (text: string) => string, seen: Map<object, unknown>): unknown {
  if (typeof value === "string") return redact(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) {
    const existing = seen.get(value);
    if (existing === undefined) throw new Error("structure contains a cycle through toJSON");
    return existing;
  }
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const item of value) copy.push(visit(item, redact, seen));
    return copy;
  }
  if (value instanceof Uint8Array) return redactBytes(value, redact);
  if (!isPlainObject(value)) {
    if (typeof (value as { toJSON?: unknown }).toJSON === "function") {
      seen.set(value, undefined);
      const result = visit((value as { toJSON: () => unknown }).toJSON(), redact, seen);
      seen.set(value, result);
      return result;
    }
    // A handle without enumerable own properties, such as a signal, serializes as `{}` and must stay usable.
    if (Object.keys(value).length === 0) return value;
  }
  const copy: Record<string, unknown> = {};
  seen.set(value, copy);
  for (const [key, item] of Object.entries(value)) {
    const redactedKey = redact(key);
    if (Object.hasOwn(copy, redactedKey)) {
      throw new Error("redacting property names produced a duplicate name");
    }
    // Use `defineProperty` so names such as `__proto__` remain own properties.
    Object.defineProperty(copy, redactedKey, {
      value: visit(item, redact, seen),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return copy;
}

/** Keep the original bytes when nothing was replaced so binary data without a registered value stays exact. */
function redactBytes(bytes: Uint8Array, redact: (text: string) => string): Uint8Array {
  const text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("utf8");
  const redacted = redact(text);
  return redacted === text ? bytes : Buffer.from(redacted, "utf8");
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}
