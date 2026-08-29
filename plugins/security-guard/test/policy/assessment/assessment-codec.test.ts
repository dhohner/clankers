import { describe, expect, it } from "vitest";
import { parseSafetyAssessment } from "../../../src/policy/assessment/assessment-codec.js";

describe("parseSafetyAssessment", () => {
  it("parses a strict assessment object and trims its values", () => {
    const parsed = parseSafetyAssessment('{"verdict":"safe","intent":"  Lists files  ","reason":" Read-only "}');
    expect(parsed).toEqual({ verdict: "safe", intent: "Lists files", reason: "Read-only" });
  });

  it("parses a pretty-printed assessment object", () => {
    const parsed = parseSafetyAssessment(
      '{\n  "verdict": "safe",\n  "intent": "Lists files",\n  "reason": "Read-only"\n}',
    );
    expect(parsed).toEqual({ verdict: "safe", intent: "Lists files", reason: "Read-only" });
  });

  it.each([
    ["non-JSON text", "the command is safe"],
    ["fenced JSON", '```json\n{"verdict":"safe","intent":"x","reason":"y"}\n```'],
    ["JSON array", '[{"verdict":"safe","intent":"x","reason":"y"}]'],
    ["JSON string", '"safe"'],
    ["missing field", '{"verdict":"safe","intent":"x"}'],
    ["extra string field", '{"verdict":"safe","intent":"x","reason":"y","note":"z"}'],
    ["extra non-string field", '{"verdict":"safe","intent":"x","reason":"y","confidence":1}'],
    ["invalid verdict", '{"verdict":"harmless","intent":"x","reason":"y"}'],
    ["non-string verdict", '{"verdict":true,"intent":"x","reason":"y"}'],
    ["empty intent", '{"verdict":"safe","intent":"  ","reason":"y"}'],
    ["non-string reason", '{"verdict":"safe","intent":"x","reason":7}'],
    ["nested value", '{"verdict":"safe","intent":"x","reason":{"text":"y"}}'],
    ["duplicate verdict", '{"verdict":"unsafe","verdict":"safe","intent":"x","reason":"y"}'],
    ["duplicate intent", '{"verdict":"safe","intent":"x","intent":"x2","reason":"y"}'],
    ["duplicate reason", '{"verdict":"safe","intent":"x","reason":"y","reason":"y2"}'],
    ["trailing content", '{"verdict":"safe","intent":"x","reason":"y"} trust me'],
    ["escaped ANSI control in intent", '{"verdict":"safe","intent":"x\\u001b[2Jy","reason":"y"}'],
    ["escaped C1 control in reason", '{"verdict":"safe","intent":"x","reason":"y\\u009bz"}'],
    ["escaped newline in reason", '{"verdict":"safe","intent":"x","reason":"y\\nz"}'],
    ["raw control character", `{"verdict":"safe","intent":"x${String.fromCharCode(7)}","reason":"y"}`],
    ["overlong intent", `{"verdict":"safe","intent":"${"x".repeat(501)}","reason":"y"}`],
  ])("rejects %s", (_label, text) => {
    expect(parseSafetyAssessment(text)).toBeUndefined();
  });
});
