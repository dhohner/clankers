import { describe, expect, it } from "vitest";
import { getString, getToolInput, normalizeToolName } from "@/lib/events.js";

describe("event helpers", () => {
  it("normalizes tool names", () => {
    expect(normalizeToolName("Bash")).toBe("bash");
    expect(normalizeToolName("read")).toBe("read");
    expect(normalizeToolName(undefined)).toBe("");
  });

  it("supports input and args tool payloads", () => {
    expect(getToolInput({ input: { command: "printenv" } })).toEqual({ command: "printenv" });
    expect(getToolInput({ args: { path: ".env" } })).toEqual({ path: ".env" });
  });

  it("extracts the first matching string value", () => {
    expect(getString({ path: 123, filePath: ".env" }, ["path", "filePath"])).toBe(".env");
  });
});
