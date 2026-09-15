import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { type HostMessage, WITHHELD_TEXT, withheldMessage } from "../../../src/infrastructure/pi/withheld.ts";

const SECRET = "sk-live-WITHHELD-0123456789";

function expectClean(message: HostMessage): void {
  const printed = `${JSON.stringify(message)}\n${inspect(message, { depth: 10 })}`;
  expect(printed).not.toContain(SECRET);
}

describe("withheld replacement messages", () => {
  it("rebuilds an assistant message from fixed fields, keeping only call pairing and the stop reason", () => {
    const original = {
      role: "assistant",
      content: [
        { type: "text", text: SECRET },
        { type: "toolCall", id: "call-1", name: "bash", arguments: { [SECRET]: SECRET } },
      ],
      api: SECRET,
      provider: SECRET,
      model: SECRET,
      responseId: SECRET,
      usage: { input: 3, output: 4 },
      stopReason: "toolUse",
      errorMessage: SECRET,
      timestamp: 7,
    } as unknown as HostMessage;

    const result = withheldMessage(original) as unknown as Record<string, unknown>;

    expectClean(result as unknown as HostMessage);
    expect(result).toEqual({
      role: "assistant",
      content: [
        { type: "text", text: WITHHELD_TEXT },
        { type: "toolCall", id: "call-1", name: "bash", arguments: {} },
      ],
      api: "redactor-withheld",
      provider: "redactor-withheld",
      model: "redactor-withheld",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "toolUse",
      errorMessage: WITHHELD_TEXT,
      timestamp: 7,
    });
  });

  it("falls back to an error stop reason and a fresh timestamp when those fields are not valid", () => {
    const original = {
      role: "assistant",
      content: [],
      stopReason: SECRET,
      timestamp: SECRET,
    } as unknown as HostMessage;

    const result = withheldMessage(original) as unknown as { stopReason: string; timestamp: number };

    expect(result.stopReason).toBe("error");
    expect(typeof result.timestamp).toBe("number");
  });

  it.each([
    [
      "user",
      { role: "user", content: SECRET, timestamp: 1, extra: SECRET },
      { role: "user", content: [{ type: "text", text: WITHHELD_TEXT }], timestamp: 1 },
    ],
    [
      "custom",
      { role: "custom", customType: "note", content: SECRET, display: true, details: { [SECRET]: 1 }, timestamp: 2 },
      {
        role: "custom",
        customType: "note",
        content: [{ type: "text", text: WITHHELD_TEXT }],
        display: true,
        details: undefined,
        timestamp: 2,
      },
    ],
    [
      "bashExecution",
      {
        role: "bashExecution",
        command: SECRET,
        output: SECRET,
        exitCode: 3,
        cancelled: false,
        truncated: true,
        fullOutputPath: `/tmp/${SECRET}.log`,
        timestamp: 3,
      },
      {
        role: "bashExecution",
        command: WITHHELD_TEXT,
        output: WITHHELD_TEXT,
        exitCode: 3,
        cancelled: false,
        truncated: false,
        timestamp: 3,
        excludeFromContext: false,
      },
    ],
    [
      "branchSummary",
      { role: "branchSummary", summary: SECRET, fromId: SECRET, timestamp: 4 },
      { role: "branchSummary", summary: WITHHELD_TEXT, fromId: null, timestamp: 4 },
    ],
    [
      "compactionSummary",
      { role: "compactionSummary", summary: SECRET, tokensBefore: 12, timestamp: 5 },
      { role: "compactionSummary", summary: WITHHELD_TEXT, tokensBefore: 12, timestamp: 5 },
    ],
    ["an unknown role", { role: "future", payload: SECRET, timestamp: 6 }, { role: "future", timestamp: 6 }],
  ])("constructs a %s replacement without copying unchecked fields", (_label, original, expected) => {
    const result = withheldMessage(original as unknown as HostMessage);

    expectClean(result);
    expect(result).toEqual(expected);
  });
});
