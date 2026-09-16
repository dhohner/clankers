import { describe, expect, it } from "vitest";
import { CredentialBindings, REFERENCE_PREFIX } from "../../src/application/credential-bindings.ts";
import { RedactionEngine } from "../../src/application/redaction-engine.ts";
import { CredentialRegistry } from "../../src/domain/credential-registry.ts";
import { REFERENCE_ID_PATTERN, referenceFor } from "../../src/domain/text-redaction.ts";

const VALUE = "sk-live-BINDING-0123456789";
const OTHER = "xoxb-OTHER-BINDING-9876543210";

function setup(references?: () => string) {
  const registry = new CredentialRegistry();
  const engine = new RedactionEngine(registry);
  const bindings = new CredentialBindings(registry, references);
  return { registry, engine, bindings };
}

describe("credential bindings", () => {
  it("binds a non-empty value under a random reference and redacts it immediately", () => {
    const { engine, bindings } = setup();

    const binding = bindings.bind({ name: "GITHUB_TOKEN", label: "GitHub" }, VALUE);

    expect(binding.state).toBe("active");
    expect(binding.reference).toMatch(new RegExp(`^${REFERENCE_PREFIX}[0-9a-f]{10}$`));
    expect(binding.reference).toMatch(REFERENCE_ID_PATTERN);
    expect(engine.redactText(`token=${VALUE}`)).toBe(`token=${referenceFor(binding.reference!)}`);
    expect(bindings.list()).toEqual([
      { name: "GITHUB_TOKEN", label: "GitHub", reference: binding.reference, state: "active" },
    ]);
  });

  it.each([
    ["undefined", undefined],
    ["empty", ""],
  ])("keeps a selection with an %s value unavailable and without a reference", (_label, value) => {
    const { registry, bindings } = setup();

    const binding = bindings.bind({ name: "MISSING", label: "Missing" }, value);

    expect(binding).toEqual({ name: "MISSING", label: "Missing", reference: undefined, state: "unavailable" });
    expect(registry.redactionEntries()).toEqual([]);
    expect(bindings.selectedNames()).toEqual(["MISSING"]);
  });

  it("does not derive the reference from the value", () => {
    const { bindings } = setup();

    const first = bindings.bind({ name: "A", label: "a" }, VALUE);
    const { bindings: again } = setup();
    const second = again.bind({ name: "A", label: "a" }, VALUE);

    expect(first.reference).not.toBe(second.reference);
    expect(first.reference!).not.toContain(VALUE);
  });

  it("keeps the reference stable when the same selection is bound again", () => {
    const { registry, bindings } = setup();
    const first = bindings.bind({ name: "A", label: "a" }, VALUE);
    const version = registry.version;

    const second = bindings.bind({ name: "A", label: "a" }, VALUE);

    expect(second.reference).toBe(first.reference);
    expect(registry.version).toBe(version);
    expect(bindings.list()).toHaveLength(1);
  });

  it("updates the label of an existing binding without rotating its reference", () => {
    const { bindings } = setup();
    const first = bindings.bind({ name: "A", label: "a" }, VALUE);

    const second = bindings.bind({ name: "A", label: "renamed" }, VALUE);

    expect(second).toEqual({ name: "A", label: "renamed", reference: first.reference, state: "active" });
    expect(bindings.list()).toEqual([second]);
  });

  it("gives equal values separate references and keeps both source identities", () => {
    const { engine, bindings } = setup();

    const first = bindings.bind({ name: "A", label: "first" }, VALUE);
    const second = bindings.bind({ name: "B", label: "second" }, VALUE);

    expect(first.reference).not.toBe(second.reference);
    expect(bindings.list().map((binding) => binding.name)).toEqual(["A", "B"]);
    expect(engine.redactText(VALUE)).toBe(referenceFor(first.reference!));
    expect(engine.redactText(VALUE)).toBe(referenceFor(first.reference!));
  });

  it("retries a colliding generated reference instead of reusing it", () => {
    const generated = ["cred-aaaaaaaaaa", "cred-aaaaaaaaaa", "cred-bbbbbbbbbb"];
    const { bindings } = setup(() => generated.shift()!);

    const first = bindings.bind({ name: "A", label: "a" }, VALUE);
    const second = bindings.bind({ name: "B", label: "b" }, OTHER);

    expect(first.reference).toBe("cred-aaaaaaaaaa");
    expect(second.reference).toBe("cred-bbbbbbbbbb");
  });

  it("generates another random reference when the first one would contain the value", () => {
    const generated = ["cred-cccccccccc", "cred-dddddddddd"];
    const { registry, engine, bindings } = setup(() => generated.shift()!);

    const binding = bindings.bind({ name: "A", label: "a" }, "cred-cc");

    expect(binding).toEqual({ name: "A", label: "a", reference: "cred-dddddddddd", state: "active" });
    expect(registry.stateOf("cred-cccccccccc")).toEqual({ kind: "unavailable", id: "cred-cccccccccc" });
    expect(engine.redactText("cred-cc")).toBe(referenceFor("cred-dddddddddd"));
  });

  it("refuses a value instead of publishing a numbered or opaque fallback reference", () => {
    const { registry, engine, bindings } = setup(() => "cred-cccccccccc");

    const binding = bindings.bind({ name: "A", label: "a" }, "cred-cc");

    expect(binding).toEqual({ name: "A", label: "a", reference: undefined, state: "refused" });
    expect(registry.redactionEntries()).toEqual([]);
    expect(engine.redactText("cred-cc")).toBe("cred-cc");
  });

  it("keeps references random for a value that some generated references would contain", () => {
    const references = new Set<string>();
    for (let index = 0; index < 5; index += 1) {
      const binding = setup().bindings.bind({ name: "A", label: "a" }, "cred-a");
      expect(binding.state).toBe("active");
      expect(binding.reference).toMatch(new RegExp(`^${REFERENCE_PREFIX}[0-9a-f]{10}$`));
      expect(referenceFor(binding.reference!)).not.toContain("cred-a");
      references.add(binding.reference!);
    }
    expect(references.size).toBe(5);
  });

  it("keeps a published reference and refuses a later value that would appear inside it", () => {
    const generated = ["cred-aaaaaaaaaa", "cred-bbbbbbbbbb"];
    const { registry, engine, bindings } = setup(() => generated.shift()!);
    const first = bindings.bind({ name: "A", label: "a" }, VALUE);
    expect(first.reference).toBe("cred-aaaaaaaaaa");

    const second = bindings.bind({ name: "B", label: "b" }, "cred-");

    expect(second).toEqual({ name: "B", label: "b", reference: undefined, state: "refused" });
    expect(bindings.list()).toEqual([first, second]);
    expect(bindings.list().find((binding) => binding.reference === "cred-aaaaaaaaaa")?.name).toBe("A");
    expect(engine.redactText(VALUE)).toBe(referenceFor("cred-aaaaaaaaaa"));
    expect(engine.redactText("cred-")).toBe("cred-");
    expect(registry.redactionEntries().map((entry) => entry.value)).toEqual([VALUE]);
  });

  it("refuses a value that would move a retained reference into an active one", () => {
    const generated = ["cred-aaaaaaaaaa", "cred-bbbbbbbbbb", "cred-cccccccccc", "cred-dddddddddd"];
    const { registry, engine, bindings } = setup(() => generated.shift()!);
    const first = bindings.bind({ name: "A", label: "a" }, "cred-a");
    expect(first.reference).toBe("cred-bbbbbbbbbb");
    const second = bindings.bind({ name: "B", label: "b" }, VALUE);
    expect(second.reference).toBe("cred-cccccccccc");
    bindings.unbind("A");

    const third = bindings.bind({ name: "C", label: "c" }, "cred-bbbbbbbbbb");

    expect(third).toEqual({ name: "C", label: "c", reference: undefined, state: "refused" });
    expect(bindings.list().find((binding) => binding.reference === "cred-cccccccccc")?.name).toBe("B");
    expect(engine.redactText("cred-a")).toBe(referenceFor("cred-bbbbbbbbbb"));
    expect(engine.redactText(VALUE)).toBe(referenceFor("cred-cccccccccc"));
    expect(registry.redactionEntries().map((entry) => entry.value)).toEqual(["cred-a", VALUE]);
  });

  it("unbinds a selection, keeps its value redacted, and ends its selection", () => {
    const { engine, bindings } = setup();
    const binding = bindings.bind({ name: "A", label: "a" }, VALUE);

    bindings.unbind("A");

    expect(bindings.list()).toEqual([]);
    expect(bindings.selectedNames()).toEqual([]);
    expect(engine.redactText(VALUE)).toBe(referenceFor(binding.reference!));
  });

  it("re-activates the retained reference when an unbound selection is bound again with the same value", () => {
    const { registry, engine, bindings } = setup();
    const first = bindings.bind({ name: "A", label: "a" }, VALUE);
    bindings.unbind("A");

    const second = bindings.bind({ name: "A", label: "a" }, VALUE);

    expect(second.reference).toBe(first.reference);
    expect(registry.stateOf(first.reference!)).toEqual({ kind: "active", id: first.reference });
    expect(registry.redactionEntries()).toHaveLength(1);
    expect(engine.redactText(VALUE)).toBe(referenceFor(second.reference!));
  });

  it("serializes bindings without exposing a value", () => {
    const { bindings } = setup();
    const binding = bindings.bind({ name: "A", label: "a" }, VALUE);

    expect(JSON.parse(JSON.stringify(bindings))).toEqual({ bindings: [binding] });
    expect(JSON.stringify(bindings)).not.toContain(VALUE);
  });

  it("publishes a refused binding for a value that has no safe reference and keeps the name selected", () => {
    const { registry, bindings } = setup();

    const binding = bindings.bind({ name: "A", label: "a" }, "[");

    expect(binding).toEqual({ name: "A", label: "a", reference: undefined, state: "refused" });
    expect(bindings.list()).toEqual([binding]);
    expect(bindings.selectedNames()).toEqual(["A"]);
    expect(registry.redactionEntries()).toEqual([]);
  });

  it("retries a refused binding and does not retain anything when it is unbound", () => {
    const { registry, bindings } = setup();
    bindings.bind({ name: "A", label: "a" }, "[");

    const retried = bindings.bind({ name: "A", label: "a" }, VALUE);
    bindings.unbind("A");

    expect(retried.state).toBe("active");
    expect(registry.stateOf(retried.reference!).kind).toBe("retained");
    expect(bindings.selectedNames()).toEqual([]);
  });
});
