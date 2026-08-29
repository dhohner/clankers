import { describe, expect, it } from "vitest";
import { translatePiToolCall } from "../../../src/infrastructure/pi/events.js";

describe("Pi event translation", () => {
  it("normalizes Bash tool names", () => {
    expect(translatePiToolCall({ toolName: "Bash", input: { command: "pwd" } } as never)).toEqual({
      kind: "bash",
      command: "pwd",
    });
  });

  it("supports compatibility args payloads", () => {
    expect(translatePiToolCall({ toolName: "read", args: { path: ".env" } } as never)).toEqual({
      kind: "read",
      path: ".env",
    });
  });

  it("extracts the first supported string path", () => {
    expect(translatePiToolCall({ toolName: "read", input: { path: 123, filePath: ".env" } } as never)).toEqual({
      kind: "read",
      path: ".env",
    });
  });
});
