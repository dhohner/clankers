import { describe, expect, it } from "vitest";
import { fileErrorCode } from "../../src/storage/filesystem.js";

describe("fileErrorCode", () => {
  it.each([
    ["Node errno", Object.assign(new Error("missing"), { code: "ENOENT" }), "ENOENT"],
    ["error without a code", new Error("failed"), undefined],
    ["numeric code", Object.assign(new Error("failed"), { code: 5 }), undefined],
    ["null code", Object.assign(new Error("failed"), { code: null }), undefined],
    ["null rejection", null, undefined],
    ["string rejection", "failed", undefined],
  ])("decodes %s", (_label, cause, expected) => {
    expect(fileErrorCode(cause)).toBe(expected);
  });
});
