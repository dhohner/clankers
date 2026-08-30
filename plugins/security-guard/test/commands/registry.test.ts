import { describe, expect, it } from "vitest";
import { COMMAND_RULES } from "../../src/commands/registry.js";

describe("command registry contract", () => {
  it("declares symlink behavior for every filesystem effect extractor", () => {
    for (const rule of COMMAND_RULES) {
      if (rule.effect.kind !== "path" && rule.effect.kind !== "write") continue;
      expect(["entry", "target"], rule.names.join(", ")).toContain(rule.effect.symlinkBehavior);
    }
  });

  it("declares every alias exactly once", () => {
    const declared = COMMAND_RULES.flatMap((rule) => rule.names);
    expect(new Set(declared).size).toBe(declared.length);
  });
});
