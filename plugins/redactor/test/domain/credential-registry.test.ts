import { describe, expect, it } from "vitest";
import { CredentialRegistry, RegistrationRefusal } from "../../src/domain/credential-registry.ts";
import {
  MAX_REFERENCE_ID_LENGTH,
  redactText,
  REFERENCE_ID_PATTERN,
  referenceFor,
} from "../../src/domain/text-redaction.ts";

describe("credential registry", () => {
  it("registers a non-empty value as active and exposes it only through redaction entries", () => {
    const registry = new CredentialRegistry();

    const state = registry.register("api-token", "sk-live-0123");

    expect(state).toEqual({ kind: "active", id: "api-token" });
    expect(registry.stateOf("api-token")).toEqual({ kind: "active", id: "api-token" });
    expect(registry.redactionEntries()).toEqual([{ id: "api-token", value: "sk-live-0123" }]);
  });

  it.each([
    ["an empty string", ""],
    ["undefined", undefined],
    ["null", null],
  ])("treats %s as unavailable and never produces an empty replacement entry", (_label, value) => {
    const registry = new CredentialRegistry();

    const state = registry.register("api-token", value);

    expect(state).toEqual({ kind: "unavailable", id: "api-token" });
    expect(registry.stateOf("api-token")).toEqual({ kind: "unavailable", id: "api-token" });
    expect(registry.redactionEntries()).toEqual([]);
  });

  it("keeps the value exact without trimming or normalizing", () => {
    const registry = new CredentialRegistry();

    registry.register("padded", "  Toḱen \n");

    expect(registry.redactionEntries()).toEqual([{ id: "padded", value: "  Toḱen \n" }]);
  });

  it("distinguishes a value retained only for redaction from an active credential", () => {
    const registry = new CredentialRegistry();
    registry.register("api-token", "sk-live-0123");

    const retained = registry.retainForRedaction("api-token");

    expect(retained).toEqual({ kind: "retained", id: "api-token" });
    expect(registry.stateOf("api-token")).toEqual({ kind: "retained", id: "api-token" });
    expect(registry.redactionEntries()).toEqual([{ id: "api-token", value: "sk-live-0123" }]);
  });

  it("re-registering an unavailable value over an active one keeps redacting the old text", () => {
    const registry = new CredentialRegistry();
    registry.register("api-token", "sk-live-0123");

    const state = registry.register("api-token", "");

    expect(state).toEqual({ kind: "retained", id: "api-token" });
    expect(registry.redactionEntries()).toEqual([{ id: "api-token", value: "sk-live-0123" }]);
  });

  it("keeps redacting a replaced value after a new value is registered under the same id", () => {
    const registry = new CredentialRegistry();
    registry.register("api-token", "sk-live-0123");
    registry.retainForRedaction("api-token");

    const state = registry.register("api-token", "sk-live-4567");

    expect(state).toEqual({ kind: "active", id: "api-token" });
    expect(registry.stateOf("api-token")).toEqual({ kind: "active", id: "api-token" });
    expect(registry.redactionEntries()).toEqual([
      { id: "api-token", value: "sk-live-4567" },
      { id: "api-token", value: "sk-live-0123" },
    ]);
    expect(registry.register("api-token", "")).toEqual({ kind: "retained", id: "api-token" });
    expect(registry.redactionEntries()).toEqual([
      { id: "api-token", value: "sk-live-4567" },
      { id: "api-token", value: "sk-live-0123" },
    ]);
  });

  it("keeps one entry when the same value is registered again under the same id", () => {
    const registry = new CredentialRegistry();
    registry.register("api-token", "sk-live-0123");
    const version = registry.version;

    registry.register("api-token", "sk-live-0123");

    expect(registry.redactionEntries()).toEqual([{ id: "api-token", value: "sk-live-0123" }]);
    expect(registry.version).toBe(version);
  });

  it("reports an unknown id as unavailable", () => {
    const registry = new CredentialRegistry();

    expect(registry.stateOf("never-registered")).toEqual({ kind: "unavailable", id: "never-registered" });
  });

  it("advances its version only when the redaction entries change", () => {
    const registry = new CredentialRegistry();
    const initial = registry.version;

    expect(registry.register("api-token", "")).toEqual({ kind: "unavailable", id: "api-token" });
    expect(registry.version).toBe(initial);

    registry.register("api-token", "sk-live-0123");
    const afterRegister = registry.version;
    expect(afterRegister).not.toBe(initial);

    registry.retainForRedaction("api-token");
    expect(registry.version).toBe(afterRegister);

    registry.register("api-token", "sk-live-4567");
    expect(registry.version).not.toBe(afterRegister);
  });

  it("rejects ids that could not be embedded in a reference", () => {
    const registry = new CredentialRegistry();

    expect(() => registry.register("", "value")).toThrow(/id/);
    expect(() => registry.register("has space", "value")).toThrow(/id/);
    expect(() => registry.register("has]bracket", "value")).toThrow(/id/);
    expect(() => registry.register("a".repeat(65), "value")).toThrow(/id/);
    expect(registry.register("a".repeat(64), "value")).toEqual({ kind: "active", id: "a".repeat(64) });
    expect(registry.redactionEntries()).toEqual([{ id: "a".repeat(64), value: "value" }]);
  });

  it("keeps a generated reference distinct from a value registered under another id", () => {
    const registry = new CredentialRegistry();
    registry.register("first", "sk-live-FIRST-0123");
    registry.register("second", referenceFor("first"));

    const entries = registry.redactionEntries();
    const redacted = redactText("sk-live-FIRST-0123", entries);

    expect(redacted).not.toBe(referenceFor("first"));
    expect(redactText(redacted, entries)).toBe(redacted);
    expect(redactText(referenceFor("first"), entries)).toBe(referenceFor("second"));
  });

  it("keeps a generated reference free of a value that another reference would contain", () => {
    const registry = new CredentialRegistry();
    registry.register("first", "sk-live-FIRST-0123");
    registry.register("second", "first");

    const entries = registry.redactionEntries();
    const redacted = redactText("sk-live-FIRST-0123", entries);

    expect(redacted).not.toContain("first");
    expect(redactText(redacted, entries)).toBe(redacted);
  });

  it("keeps a disambiguated reference id within the reference id limits", () => {
    const registry = new CredentialRegistry();
    const longId = "a".repeat(MAX_REFERENCE_ID_LENGTH);
    registry.register(longId, "sk-live-LONG-0123");
    registry.register("other", referenceFor(longId));

    const [first] = registry.redactionEntries();

    expect(first!.id).not.toBe(longId);
    expect(REFERENCE_ID_PATTERN.test(first!.id)).toBe(true);
  });

  it("refuses a value that would move an existing reference when references must be preserved", () => {
    const registry = new CredentialRegistry();
    registry.register("cred-aaaaaaaaaa", "cred-a");
    registry.register("cred-bbbbbbbbbb", "cred-b");
    expect(registry.referenceOf("cred-aaaaaaaaaa")).toBe("redacted-1");
    expect(registry.referenceOf("cred-bbbbbbbbbb")).toBe("redacted-2");
    const version = registry.version;

    expect(() => registry.register("cred-cccccccccc", "redacted-1", { preserveReferences: true })).toThrow(
      /cred-cccccccccc.*would move/,
    );

    expect(registry.referenceOf("cred-aaaaaaaaaa")).toBe("redacted-1");
    expect(registry.referenceOf("cred-bbbbbbbbbb")).toBe("redacted-2");
    expect(registry.stateOf("cred-cccccccccc")).toEqual({ kind: "unavailable", id: "cred-cccccccccc" });
    expect(registry.version).toBe(version);
    expect(registry.redactionEntries().map((entry) => entry.value)).toEqual(["cred-a", "cred-b"]);
  });

  it("refuses a registration whose id would get a fallback reference when an exact reference is required", () => {
    const registry = new CredentialRegistry();
    registry.register("token", "sk-live-0123");
    const version = registry.version;

    expect(() => registry.register("cred-aaaaaaaaaa", "cred-a", { exactReference: true })).toThrow(
      /cred-aaaaaaaaaa.*fallback/,
    );
    let refusal: unknown;
    try {
      registry.register("cred-aaaaaaaaaa", "cred-a", { exactReference: true });
    } catch (error) {
      refusal = error;
    }

    expect(refusal).toBeInstanceOf(RegistrationRefusal);
    expect((refusal as RegistrationRefusal).reason).toBe("fallback-reference");
    expect(registry.stateOf("cred-aaaaaaaaaa")).toEqual({ kind: "unavailable", id: "cred-aaaaaaaaaa" });
    expect(registry.version).toBe(version);
    expect(registry.register("cred-bbbbbbbbbb", "cred-a", { exactReference: true })).toEqual({
      kind: "active",
      id: "cred-bbbbbbbbbb",
    });
    expect(registry.referenceOf("cred-bbbbbbbbbb")).toBe("cred-bbbbbbbbbb");
  });

  it("moves references for the same value when preservation is not requested", () => {
    const registry = new CredentialRegistry();
    registry.register("cred-aaaaaaaaaa", "cred-a");
    registry.register("cred-bbbbbbbbbb", "cred-b");

    registry.register("cred-cccccccccc", "redacted-1");

    expect(registry.referenceOf("cred-aaaaaaaaaa")).toBe("redacted-2");
    expect(registry.referenceOf("cred-bbbbbbbbbb")).toBe("redacted-3");
  });

  it("refuses a value that every generated reference would contain, without changing the registry", () => {
    const registry = new CredentialRegistry();
    registry.register("token", "sk-live-0123");

    expect(() => registry.register("fragment", "dact")).toThrow(/fragment/);
    expect(registry.stateOf("fragment")).toEqual({ kind: "unavailable", id: "fragment" });
    expect(registry.redactionEntries()).toEqual([{ id: "token", value: "sk-live-0123" }]);
  });

  it("never names the refused value in the error it throws", () => {
    const registry = new CredentialRegistry();

    let message = "";
    try {
      registry.register("fragment", "dact");
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).not.toBe("");
    expect(message).not.toContain("dact");
  });

  it("never exposes a value through its state or string form", () => {
    const registry = new CredentialRegistry();
    registry.register("api-token", "sk-live-0123");

    expect(JSON.stringify(registry.stateOf("api-token"))).not.toContain("sk-live-0123");
    expect(JSON.stringify(registry)).not.toContain("sk-live-0123");
    expect(String(registry)).not.toContain("sk-live-0123");
  });
});
