import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { RedactionEngine } from "../../../src/application/redaction-engine.ts";
import { CredentialRegistry } from "../../../src/domain/credential-registry.ts";
import { referenceFor } from "../../../src/domain/text-redaction.ts";
import { registerProviderRequestProtection } from "../../../src/infrastructure/pi/provider-request.ts";

const SECRET = "sk-live-PROVIDER-0123456789";

type Handler = (event: { payload: unknown }, ctx: { abort: () => void; model?: { api: string } }) => unknown;
const MODEL = { api: "openai-completions" };

function capture(register: (pi: ExtensionAPI) => void): Handler {
  let handler: Handler | undefined;
  const pi = {
    on: (name: string, fn: Handler) => {
      if (name === "before_provider_request") handler = fn;
    },
  } as unknown as ExtensionAPI;
  register(pi);
  expect(handler).toBeDefined();
  return handler!;
}

describe("before_provider_request protection", () => {
  it("redacts every string in the outgoing payload and leaves the structure intact", () => {
    const registry = new CredentialRegistry();
    registry.register("token", SECRET);
    const handler = capture((pi) => registerProviderRequestProtection(pi, new RedactionEngine(registry)));
    const payload = {
      model: "m",
      messages: [{ role: "user", content: [{ type: "text", text: `use ${SECRET}` }] }],
      n: 2,
    };

    const result = handler({ payload }, { abort: vi.fn(), model: MODEL });

    expect(result).toEqual({
      model: "m",
      messages: [{ role: "user", content: [{ type: "text", text: `use ${referenceFor("token")}` }] }],
      n: 2,
    });
    expect(JSON.stringify(payload)).toContain(SECRET);
  });

  it("aborts and substitutes an empty payload when redaction fails, even when abort itself throws", () => {
    const registry = new CredentialRegistry();
    registry.register("token", SECRET);
    const engine = new RedactionEngine(registry, {
      redactText: () => {
        throw new Error("boom");
      },
    });
    const handler = capture((pi) => registerProviderRequestProtection(pi, engine));
    const abort = vi.fn(() => {
      throw new Error("runner superseded");
    });

    const result = handler({ payload: { text: SECRET } }, { abort, model: MODEL });

    expect(abort).toHaveBeenCalledOnce();
    expect(result).toEqual({});
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });
});
