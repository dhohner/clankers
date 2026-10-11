import { describe, expect, it } from "vitest";
import { parseJsonObject } from "../../src/storage/json.js";

describe("parseJsonObject", () => {
  it("preserves nested JSON values and settings keys", () => {
    const content = '{"outputStyle":"brief","other":[null,true,2,{"nested":"value"}]}';

    expect(parseJsonObject(content)).toEqual({ outputStyle: "brief", other: [null, true, 2, { nested: "value" }] });
  });

  it("accepts an empty object", () => {
    expect(parseJsonObject("{}")).toEqual({});
  });

  it.each(["null", "[]", '"brief"', "2", "true"])("refuses a non-object root: %s", (content) => {
    expect(() => parseJsonObject(content)).toThrow("settings file does not hold a JSON object");
  });

  it("preserves syntax errors from the JSON parser", () => {
    expect(() => parseJsonObject("{")).toThrow(SyntaxError);
  });
});
