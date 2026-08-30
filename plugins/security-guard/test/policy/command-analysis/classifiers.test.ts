import { afterEach, describe, expect, it, vi } from "vitest";
import type { CommandRule } from "../../../src/commands/registry.js";

const REGISTRY = "../../../src/commands/registry.js";
const CLASSIFIERS = "../../../src/policy/command-analysis/classifiers.js";

type Registry = typeof import("../../../src/commands/registry.js");
type RuleTransform = (rules: readonly CommandRule[]) => readonly CommandRule[];

/** Loads the classifier table after transforming its command registry. */
async function loadWithRules(transform: RuleTransform): Promise<void> {
  vi.doMock(REGISTRY, async () => {
    const actual = await vi.importActual<Registry>(REGISTRY);
    return { ...actual, COMMAND_RULES: transform(actual.COMMAND_RULES) };
  });
  await import(CLASSIFIERS);
}

afterEach(() => {
  vi.doUnmock(REGISTRY);
  vi.resetModules();
});

// A command the registry knows and the classifier table does not is read as harmless, so `wipefs -a /dev/sda`
// would run unannounced. The table refuses to load instead of deciding that quietly.
describe("classifier coverage", () => {
  it.each(["unmodeled" as const, "path" as const])(
    "refuses to load when a rule with %s has no classifier",
    async (kind) => {
      const effect: CommandRule["effect"] =
        kind === "unmodeled"
          ? { kind: "unmodeled" }
          : {
              kind: "path",
              options: { kind: "standard", longFlags: [], longValues: [], shortFlags: "", shortValues: "" },
              symlinkBehavior: "entry",
              allowsShallowGlob: false,
            };
      await expect(loadWithRules((rules) => [...rules, { names: ["wipefs"], effect }])).rejects.toThrow(
        "Command rules without a classifier: wipefs",
      );
    },
  );

  it("refuses to load when a classified command loses its rule", async () => {
    await expect(loadWithRules((rules) => rules.filter((rule) => !rule.names.includes("dd")))).rejects.toThrow(
      "Classifiers for unregistered commands: dd",
    );
  });

  it("refuses to load when a classified command becomes harmless", async () => {
    await expect(
      loadWithRules((rules) =>
        rules.map((rule) => (rule.names.includes("dd") ? { ...rule, effect: { kind: "none" as const } } : rule)),
      ),
    ).rejects.toThrow("Classifiers for commands the registry calls harmless: dd");
  });

  it("loads the real tables without complaint", async () => {
    const { classifierFor } = await import(CLASSIFIERS);
    expect(classifierFor("dd")).toBeDefined();
  });
});
