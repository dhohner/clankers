import { inspect } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { RedactionEngine, RedactionFailure } from "../../src/application/redaction-engine.ts";
import { CredentialRegistry } from "../../src/domain/credential-registry.ts";
import { referenceFor } from "../../src/domain/text-redaction.ts";

const SECRET = "sk-live-ENGINE-01";

function createEngine() {
  const registry = new CredentialRegistry();
  registry.register("token", SECRET);
  return { registry, engine: new RedactionEngine(registry) };
}

function caught(act: () => unknown): unknown {
  try {
    act();
  } catch (error) {
    return error;
  }
  throw new Error("expected the action to throw");
}

/** Check the operation and approved cause name without exposing content. */
function expectSanitizedFailure(failure: unknown, operation: string, secret: string): RedactionFailure {
  expect(failure).toBeInstanceOf(RedactionFailure);
  const typed = failure as RedactionFailure;
  expect(typed.operation).toBe(operation);
  expect(typed.message).toBe(`redaction failed during ${operation}; the affected content was withheld`);
  expect(typed.cause).toBeUndefined();
  expect(String(typed)).not.toContain(secret);
  // Inspect the full object because hosts may print more than `Error.message`.
  expect(inspect(typed, { depth: 10 })).not.toContain(secret);
  expect(JSON.stringify(typed)).not.toContain(secret);
  return typed;
}

describe("redaction engine", () => {
  it("redacts text with the registry's current entries, including entries registered later", () => {
    const { registry, engine } = createEngine();

    expect(engine.redactText(`a ${SECRET} b`)).toBe(`a ${referenceFor("token")} b`);

    registry.register("second", "later-value");
    expect(engine.redactText("later-value")).toBe(referenceFor("second"));
  });

  it("redacts nested structures and streams through the same entries", () => {
    const { engine } = createEngine();

    expect(engine.redactDeep({ details: [SECRET], n: 1 })).toEqual({ details: [referenceFor("token")], n: 1 });

    const stream = engine.openByteStream();
    const text =
      stream.push(Buffer.from(`x ${SECRET.slice(0, 4)}`)) + stream.push(Buffer.from(SECRET.slice(4))) + stream.finish();
    expect(text).toBe(`x ${referenceFor("token")}`);
  });

  it("converts an algorithm error into a sanitized failure that names the operation but not the content", () => {
    const { registry } = createEngine();
    const engine = new RedactionEngine(registry, {
      redactText: (text) => {
        throw new Error(`exploded while handling ${text}`);
      },
    });

    const failure = caught(() => engine.redactText(`payload ${SECRET}`));

    const typed = expectSanitizedFailure(failure, "text", SECRET);
    expect(typed.message).not.toContain("payload");
    expect(typed.causeName).toBe("Error");
  });

  it("keeps a non-error cause out of the failure too", () => {
    const { registry } = createEngine();
    const engine = new RedactionEngine(registry, {
      redactText: () => {
        throw `raw string containing ${SECRET}`;
      },
    });

    let failure: unknown;
    try {
      engine.redactText("payload");
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(RedactionFailure);
    expect((failure as RedactionFailure).causeName).toBe("string");
    expect(inspect(failure, { depth: 10 })).not.toContain(SECRET);
  });

  it("reports an error with an unknown name as a plain Error so the name cannot carry content", () => {
    const { registry } = createEngine();
    const engine = new RedactionEngine(registry, {
      redactText: () => {
        const error = new Error("boom");
        error.name = `Leak${SECRET}`;
        throw error;
      },
    });

    let failure: unknown;
    try {
      engine.redactText("payload");
    } catch (error) {
      failure = error;
    }

    expect((failure as RedactionFailure).causeName).toBe("Error");
    expect(inspect(failure, { depth: 10 })).not.toContain(SECRET);
  });

  it("redacts several structures through one registry snapshot and reports a failing pass as a structure failure", () => {
    const { registry, engine } = createEngine();
    const entriesRead = vi.spyOn(registry, "redactionEntries");

    const result = engine.redactWith((redactValue) => [redactValue({ a: SECRET }), redactValue([SECRET])]);

    expect(result).toEqual([{ a: referenceFor("token") }, [referenceFor("token")]]);
    expect(entriesRead).toHaveBeenCalledTimes(1);
    const failure = caught(() =>
      engine.redactWith(() => {
        throw new Error(`inside ${SECRET}`);
      }),
    );
    expect(expectSanitizedFailure(failure, "structure", SECRET).causeName).toBe("Error");
  });

  it("reports a stream that fails while opening or pushing as a sanitized failure", () => {
    const { registry } = createEngine();
    const engine = new RedactionEngine(registry, {
      createByteStream: () => {
        throw new Error(`no stream for ${SECRET}`);
      },
    });

    const failure = caught(() => engine.openByteStream());

    expect(expectSanitizedFailure(failure, "stream-open", SECRET).causeName).toBe("Error");
  });
});
