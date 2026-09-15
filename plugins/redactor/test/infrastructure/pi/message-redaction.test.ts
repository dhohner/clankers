import { describe, expect, it } from "vitest";
import { RedactionEngine } from "../../../src/application/redaction-engine.ts";
import { CredentialRegistry } from "../../../src/domain/credential-registry.ts";
import { referenceFor } from "../../../src/domain/text-redaction.ts";
import { redactMessage } from "../../../src/infrastructure/pi/message-redaction.ts";
import type { HostMessage } from "../../../src/infrastructure/pi/withheld.ts";

const SECRET = "sk-live-MESSAGE-0123456789";

function redactor(...values: string[]) {
  const registry = new CredentialRegistry();
  registry.register("token", SECRET);
  values.forEach((value, index) => registry.register(`word-${index}`, value));
  const engine = new RedactionEngine(registry);
  return (message: HostMessage) => engine.redactWith((redactValue) => redactMessage(message, redactValue));
}

describe("schema-aware message redaction", () => {
  it("keeps the role, stop reason, and content types when their words are registered values", () => {
    const redact = redactor("assistant", "text", "toolUse", "toolCall");
    const message = {
      role: "assistant",
      content: [
        { type: "text", text: `assistant said ${SECRET}` },
        { type: "toolCall", id: "call-1", name: "bash", arguments: { command: SECRET } },
      ],
      api: "openai-completions",
      provider: "synthetic",
      model: "double",
      usage: { input: 1 },
      stopReason: "toolUse",
      timestamp: 5,
    } as unknown as HostMessage;

    const result = redact(message) as unknown as Record<string, unknown>;

    expect(result.role).toBe("assistant");
    expect(result.stopReason).toBe("toolUse");
    expect(result.content).toEqual([
      { type: "text", text: `${referenceFor("word-0")} said ${referenceFor("token")}` },
      { type: "toolCall", id: "call-1", name: "bash", arguments: { command: referenceFor("token") } },
    ]);
    expect(result.timestamp).toBe(5);
    expect(result.usage).toEqual({ input: 1 });
  });

  it("redacts tool argument names, provider names, and error text as data", () => {
    const redact = redactor("synthetic");
    const message = {
      role: "assistant",
      content: [{ type: "toolCall", id: "call-2", name: "bash", arguments: { [SECRET]: "x", command: "ls" } }],
      api: "openai-completions",
      provider: "synthetic",
      model: "double",
      usage: {},
      stopReason: "toolUse",
      errorMessage: `failed with ${SECRET}`,
      timestamp: 1,
    } as unknown as HostMessage;

    const result = redact(message) as unknown as Record<string, unknown>;

    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(result.provider).toBe(referenceFor("word-0"));
    expect(result.errorMessage).toBe(`failed with ${referenceFor("token")}`);
    expect((result.content as Array<{ arguments: unknown }>)[0]!.arguments).toEqual({
      [referenceFor("token")]: "x",
      command: "ls",
    });
  });

  it("keeps tool result pairing fields and the custom type while redacting their data", () => {
    const redact = redactor("bash", "note");
    const toolResult = {
      role: "toolResult",
      toolCallId: "call-3",
      toolName: "bash",
      content: [{ type: "text", text: SECRET }],
      details: { [SECRET]: SECRET },
      isError: false,
      timestamp: 2,
    } as unknown as HostMessage;
    const custom = {
      role: "custom",
      customType: "note",
      content: `note ${SECRET}`,
      display: true,
      timestamp: 3,
    } as unknown as HostMessage;

    const resultA = redact(toolResult) as unknown as Record<string, unknown>;
    const resultB = redact(custom) as unknown as Record<string, unknown>;

    expect(resultA.toolName).toBe("bash");
    expect(resultA.toolCallId).toBe("call-3");
    expect(resultA.content).toEqual([{ type: "text", text: referenceFor("token") }]);
    expect(resultA.details).toEqual({ [referenceFor("token")]: referenceFor("token") });
    expect(resultB.customType).toBe("note");
    expect(resultB.content).toBe(`${referenceFor("word-1")} ${referenceFor("token")}`);
  });

  it("does not preserve protocol-looking fields nested inside data", () => {
    const redact = redactor("assistant");
    const message = {
      role: "toolResult",
      toolCallId: "call-4",
      toolName: "bash",
      content: [],
      details: { role: "assistant", type: "text", model: SECRET, name: SECRET },
      timestamp: 4,
    } as unknown as HostMessage;

    const result = redact(message) as unknown as { details: Record<string, string> };

    expect(result.details).toEqual({
      role: referenceFor("word-0"),
      type: "text",
      model: referenceFor("token"),
      name: referenceFor("token"),
    });
  });

  it("keeps only the role of an unknown message shape and redacts every other field", () => {
    const redact = redactor();
    const message = { role: "bashExecution", command: `cat ${SECRET}`, output: SECRET, exitCode: 0, timestamp: 9 };

    const result = redact(message as unknown as HostMessage) as unknown as Record<string, unknown>;

    expect(result).toEqual({
      role: "bashExecution",
      command: `cat ${referenceFor("token")}`,
      output: referenceFor("token"),
      exitCode: 0,
      timestamp: 9,
    });
  });
});
