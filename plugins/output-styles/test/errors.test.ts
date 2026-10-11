import { describe, expect, it } from "vitest";
import { describeError } from "../src/errors.ts";

describe("describeError", () => {
  it("uses the message of an Error", () => {
    expect(describeError(new Error("EACCES: permission denied"))).toBe("EACCES: permission denied");
  });

  it("stringifies a rejection value that is not an Error", () => {
    expect(describeError("plain string failure")).toBe("plain string failure");
  });
});
