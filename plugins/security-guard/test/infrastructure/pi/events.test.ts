import type { ToolCallEvent } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import type { ToolCall } from "../../../src/application/decide-tool-call.js";
import { translatePiToolCall } from "../../../src/infrastructure/pi/events.js";

type EventFixture = {
  toolName: string;
  input?: ToolCallEvent["input"] | null;
  args?: ToolCallEvent["input"];
};

type TranslationCase = { name: string; event: EventFixture; expected: ToolCall };

const cases: TranslationCase[] = [
  {
    name: "normalizes Bash tool names",
    event: { toolName: "Bash", input: { command: "pwd" } },
    expected: { kind: "bash", command: "pwd" },
  },
  {
    name: "supports compatibility args payloads",
    event: { toolName: "read", args: { path: ".env" } },
    expected: { kind: "read", path: ".env" },
  },
  {
    name: "extracts the first supported string path",
    event: { toolName: "read", input: { path: 123, filePath: ".env" } },
    expected: { kind: "read", path: ".env" },
  },
  {
    name: "prefers input over compatibility args",
    event: { toolName: "read", input: { path: "first" }, args: { path: "second" } },
    expected: { kind: "read", path: "first" },
  },
  {
    name: "uses compatibility args when input is null",
    event: { toolName: "read", input: null, args: { file: ".env" } },
    expected: { kind: "read", path: ".env" },
  },
  {
    name: "keeps an empty string as the first supported path",
    event: { toolName: "read", input: { path: "", file: "second" } },
    expected: { kind: "read", path: "" },
  },
  {
    name: "ignores non-string commands",
    event: { toolName: "bash", input: { command: 123 } },
    expected: { kind: "bash", command: "" },
  },
  {
    name: "handles a missing payload",
    event: { toolName: "bash" },
    expected: { kind: "bash", command: "" },
  },
  {
    name: "ignores unrelated tools",
    event: { toolName: "write", input: { path: ".env" } },
    expected: { kind: "other" },
  },
];

describe("Pi event translation", () => {
  it.each(cases)("$name", ({ event, expected }) => {
    // SAFETY: Translation reads only toolName and payload fields; legacy hosts omit input and event metadata.
    expect(translatePiToolCall(event as ToolCallEvent)).toEqual(expected);
  });
});
