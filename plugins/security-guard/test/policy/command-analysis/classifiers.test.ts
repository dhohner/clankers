import { describe, expect, it } from "vitest";
import { COMMAND_RULES, type CommandRule } from "../../../src/commands/registry.js";
import { classifierFor, createClassifierTable } from "../../../src/policy/command-analysis/classifiers.js";

// Missing classifiers would allow destructive commands silently, so table construction must reject them.
describe("classifier coverage", () => {
  it.each(["unmodeled" as const, "path" as const])("rejects a rule with %s that has no classifier", (kind) => {
    const effect: CommandRule["effect"] =
      kind === "unmodeled"
        ? { kind: "unmodeled" }
        : {
            kind: "path",
            options: { kind: "standard", longFlags: [], longValues: [], shortFlags: "", shortValues: "" },
            symlinkBehavior: "entry",
            allowsShallowGlob: false,
          };

    expect(() => createClassifierTable([...COMMAND_RULES, { names: ["wipefs"], effect }])).toThrow(
      "Command rules without a classifier: wipefs",
    );
  });

  it("rejects a classified command that loses its rule", () => {
    expect(() => createClassifierTable(COMMAND_RULES.filter((rule) => !rule.names.includes("dd")))).toThrow(
      "Classifiers for unregistered commands: dd",
    );
  });

  it("rejects a classified command that becomes harmless", () => {
    const rules = COMMAND_RULES.map((rule): CommandRule =>
      rule.names.includes("dd") ? { ...rule, effect: { kind: "none" } } : rule,
    );

    expect(() => createClassifierTable(rules)).toThrow("Classifiers for commands the registry calls harmless: dd");
  });

  it("rejects duplicate classifiers", () => {
    const classify = classifierFor("dd")!;

    expect(() => createClassifierTable(COMMAND_RULES, [{ names: ["dd", "dd"], classify }])).toThrow(
      "Duplicate command classifier: dd",
    );
  });

  it("loads the real tables and preserves classifier lookup", () => {
    const table = createClassifierTable(COMMAND_RULES);

    expect(table.get("dd")).toBeDefined();
    expect(classifierFor("dd")).toBe(table.get("dd"));
    expect(classifierFor("unregistered")).toBeUndefined();
  });
});
