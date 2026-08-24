import { describe, expect, it } from "vitest";
import { classifyShellAst } from "../../src/policy/command-analysis/commands/classify-command.js";
import { proveShellEffects } from "../../src/proof/provable-call.js";
import { analyzeCommand } from "../../src/policy/command-analysis/analyze-command.js";
import { COMMAND_RULES, registeredCommandAliases } from "../../src/policy/command-analysis/command-registry.js";
import { parseShell } from "../../src/shell/parse.js";

describe("command registry contract", () => {
  it("gives every potentially destructive command an extractor or approval-only policy", () => {
    for (const rule of COMMAND_RULES.filter((candidate) => candidate.classification !== "never")) {
      expect(rule.approvalOnly === true || rule.effect.kind === "path", rule.names.join(", ")).toBe(true);
    }
  });

  it("declares symlink behavior for every filesystem effect extractor", () => {
    for (const rule of COMMAND_RULES) {
      if (rule.effect.kind !== "path" && rule.effect.kind !== "write") continue;
      expect(["entry", "target"], rule.names.join(", ")).toContain(rule.effect.symlinkBehavior);
    }
  });

  it("registers every alias exactly once", () => {
    const declared = COMMAND_RULES.flatMap((rule) => rule.names);
    const aliases = registeredCommandAliases();
    expect(new Set(declared).size).toBe(declared.length);
    expect(aliases).toEqual(declared);
  });

  it.each([
    "rm --unknown out",
    "rm -Z out",
    "unlink -f out",
    "truncate -Z 0 file",
    "mv --unknown old new",
    "chmod --unknown 644 file",
    "chown --unknown user file",
    "rm out; touch --unknown probe",
    "rm out; mkdir --unknown probe",
  ])("fails closed on unknown options in %s", (command) => {
    expect(analyzeCommand(command)).toMatchObject({
      kind: "approvalRequired",
      reason: { kind: "unprovable-effects" },
    });
  });

  it("passes the same retained command resolutions to classification and proof", () => {
    const parsed = parseShell("rm -rf build; echo done");
    expect(parsed.kind).toBe("parsed");
    if (parsed.kind !== "parsed") return;

    const resolutions = parsed.ast.commands.map((command) => command.resolved);
    const classification = classifyShellAst(parsed.ast);
    const proof = proveShellEffects(parsed.ast, classification.destructiveStarts);

    expect(parsed.ast.commands.map((command) => command.resolved)).toEqual(resolutions);
    expect(classification.destructive).toBe(true);
    expect(proof).toMatchObject({ kind: "proven", value: { targets: [{ path: "build" }] } });
  });

  it.each([
    ["echo $((1 + 1))", "arithmetic"],
    ["cat <(printf x)", "process-substitution"],
    ["[[ -f file ]]", "test-expression"],
    ["f() { rm -rf build; }", "function-definition"],
    ["echo 'unterminated", "unterminated-quote"],
  ])("returns an explicit unsupported-syntax result for %s", (command, detail) => {
    expect(analyzeCommand(command)).toEqual({
      kind: "approvalRequired",
      reason: { kind: "unsupported-syntax", detail },
    });
  });

  it.each(["echo 'f() { rm -rf build; }'", "echo '[[ -f file ]]'", 'echo "<(printf x)"'])(
    "keeps unsupported-looking quoted text literal in %s",
    (command) => {
      expect(analyzeCommand(command)).toEqual({ kind: "notDestructive" });
    },
  );
});
