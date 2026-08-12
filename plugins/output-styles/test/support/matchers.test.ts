import { describe, expect, it } from "vitest";

describe("toEqualUnordered", () => {
  it("compares nested values without changing either array", () => {
    const received = [{ name: "brief" }, { name: "terse" }];
    const expected = [{ name: "terse" }, { name: "brief" }];

    expect(received).toEqualUnordered(expected);
    expect(received).toEqual([{ name: "brief" }, { name: "terse" }]);
    expect(expected).toEqual([{ name: "terse" }, { name: "brief" }]);
  });

  it("requires the same item multiplicities", () => {
    expect(["brief", "brief", "terse"]).toEqualUnordered(["terse", "brief", "brief"]);
    expect(() => expect(["brief", "brief", "terse"]).toEqualUnordered(["brief", "terse", "terse"])).toThrow();
  });

  it("finds a complete pairing for overlapping asymmetric matchers", () => {
    const received = [
      { name: "brief", source: "user" },
      { name: "terse", source: "user" },
    ];

    expect(received).toEqualUnordered([
      expect.objectContaining({ source: "user" }),
      expect.objectContaining({ name: "brief" }),
    ]);
  });

  it("supports negation", () => {
    expect(["brief", "terse"]).not.toEqualUnordered(["brief", "learning"]);
  });

  it("reports a clear failure when the received value is not an array", () => {
    expect(() => expect("brief").toEqualUnordered(["brief"])).toThrow("expected an array");
  });
});
