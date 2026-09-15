import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { RedactionEngine } from "../../../src/application/redaction-engine.ts";
import { CredentialRegistry } from "../../../src/domain/credential-registry.ts";
import { referenceFor } from "../../../src/domain/text-redaction.ts";
import { registerContextProtection } from "../../../src/infrastructure/pi/messages.ts";
import { WITHHELD_TEXT } from "../../../src/infrastructure/pi/withheld.ts";

const SECRET = "sk-live-CONTEXT-0123456789";

type Handler = (event: { messages: unknown[] }) => { messages: unknown[] } | undefined;

function capture(register: (pi: ExtensionAPI) => void): Handler {
  let handler: Handler | undefined;
  const pi = {
    on: (name: string, fn: Handler) => {
      if (name === "context") handler = fn;
    },
  } as unknown as ExtensionAPI;
  register(pi);
  expect(handler).toBeDefined();
  return handler!;
}

describe("context protection", () => {
  it("redacts every message handed to the model without mutating the originals", () => {
    const registry = new CredentialRegistry();
    registry.register("token", SECRET);
    const handler = capture((pi) => registerContextProtection(pi, new RedactionEngine(registry)));
    const messages = [
      { role: "user", content: `use ${SECRET}`, timestamp: 1 },
      { role: "assistant", content: [{ type: "text", text: `saw ${SECRET}` }], timestamp: 2 },
    ];

    const result = handler({ messages });

    expect(result?.messages).toEqual([
      { role: "user", content: `use ${referenceFor("token")}`, timestamp: 1 },
      { role: "assistant", content: [{ type: "text", text: `saw ${referenceFor("token")}` }], timestamp: 2 },
    ]);
    expect(JSON.stringify(messages)).toContain(SECRET);
  });

  it("reads the registry once per model call instead of once per message", () => {
    const registry = new CredentialRegistry();
    registry.register("token", SECRET);
    const entriesRead = vi.spyOn(registry, "redactionEntries");
    const handler = capture((pi) => registerContextProtection(pi, new RedactionEngine(registry)));
    const messages = Array.from({ length: 5 }, (_, index) => ({
      role: "user",
      content: `message ${index} ${SECRET}`,
      timestamp: index,
    }));

    const result = handler({ messages });

    expect(entriesRead).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(result?.messages).toHaveLength(5);
  });

  it("withholds a message whose redaction fails instead of passing it through raw", () => {
    const registry = new CredentialRegistry();
    registry.register("token", SECRET);
    const engine = new RedactionEngine(registry, {
      redactText: (text) => {
        if (text.includes("fail")) throw new Error("boom");
        return text;
      },
    });
    const handler = capture((pi) => registerContextProtection(pi, engine));

    const result = handler({
      messages: [
        { role: "user", content: `fail ${SECRET}`, timestamp: 1 },
        { role: "user", content: "fine", timestamp: 2 },
      ],
    });

    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(result?.messages).toEqual([
      { role: "user", content: [{ type: "text", text: WITHHELD_TEXT }], timestamp: 1 },
      { role: "user", content: "fine", timestamp: 2 },
    ]);
  });
});
