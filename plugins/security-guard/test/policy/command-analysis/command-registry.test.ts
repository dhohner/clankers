import { describe, expect, it } from "vitest";
import { classifyShellAst } from "../../../src/policy/command-analysis/commands/classify-command.js";
import { proveShellEffects } from "../../../src/proof/provable-call.js";
import { analyzeCommand } from "../../../src/policy/command-analysis/analyze-command.js";
import { COMMAND_RULES, registeredCommandAliases } from "../../../src/policy/command-analysis/command-registry.js";
import { parseShell } from "../../../src/shell/parse.js";

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
    ["(( x += 1 ))", "arithmetic"],
    ["f() { rm -rf build; }", "function-definition"],
    ["function f() { rm -rf build; }", "function-definition"],
    ["case x in a) rm -rf build;& esac", "unsupported-control-operator"],
    ["echo 'unterminated", "unterminated-quote"],
  ])("returns an explicit unsupported-syntax result for %s", (command, detail) => {
    expect(analyzeCommand(command)).toEqual({
      kind: "approvalRequired",
      reason: { kind: "unsupported-syntax", detail },
    });
  });

  it.each([
    "echo 'f() { rm -rf build; }'",
    "echo '(( x += 1 ))'",
    "echo '$((1+1))'",
    "echo '$[1+1]'",
    'echo "<(rm -rf build)"',
    "'<(printf rm)' -rf build",
    '"a<(printf rm)" -rf build',
  ])("keeps unsupported-looking quoted text literal in %s", (command) => {
    expect(analyzeCommand(command)).toEqual({ kind: "notDestructive" });
  });

  it.each([
    "[[ -f .env.example ]] && echo present",
    "[[ -f a && -f b ]]",
    "[[ ! -f a || -d b ]] || echo absent",
    '[[ -n "$x" && $y == rm ]]',
    "echo $((1 + 1))",
    "echo $(( (1 + 2) * 3 ))",
    "diff <(git show main:a.ts) a.ts",
    "tee >(cat) < a.ts",
    "if [[ x && rm == y ]]; then echo ok; fi",
    "while [[ x && rm == y ]]; do break; done",
    "! [[ x && rm == y ]]",
    "time [[ x && rm == y ]]",
    "time -p [[ x && rm == y ]]",
  ])("accepts the plain construct in %s", (command) => {
    expect(analyzeCommand(command)).toEqual({ kind: "notDestructive" });
  });

  it.each(["x='a[$(rm -rf build)]'; echo $((x))", "x='a[$(rm -rf build)]'; echo $(( $((x)) ))", "[[ $x -eq 1 ]]"])(
    "sends %s to approval because arithmetic reads a value the text never shows",
    (command) => {
      expect(analyzeCommand(command)).toMatchObject({ kind: "approvalRequired" });
    },
  );

  it("fails closed on an arithmetic command nested in a process substitution", () => {
    expect(analyzeCommand("x='a[$(rm -rf build)]'; diff <(((x))) a.ts")).toMatchObject({
      kind: "approvalRequired",
    });
  });

  it("returns approval instead of overflowing the stack on deeply nested arithmetic", () => {
    const command = `echo ${"$((".repeat(10_000)}1${"))".repeat(10_000)}`;
    expect(command).toHaveLength(50_006);
    expect(analyzeCommand(command)).toMatchObject({ kind: "approvalRequired" });
  });

  it.each(["arr[0]=1 rm -rf build", "arr[0]+=1 rm -rf build", "x+=1 rm -rf build"])(
    "proves the command %s runs behind its assignment prefix",
    (command) => {
      expect(analyzeCommand(command)).toMatchObject({
        kind: "temporaryCleanup",
        proof: { targets: [{ path: "build" }], commands: ["rm"] },
      });
    },
  );

  it.each(["PATH[0]=/evil rm -rf build", "TMPDIR+=/evil rm -rf build"])(
    "sends %s to approval because the assignment prefix names a sensitive variable",
    (command) => {
      expect(analyzeCommand(command)).toEqual({
        kind: "approvalRequired",
        reason: { kind: "unprovable-effects", detail: "sensitive shell variable assignment" },
      });
    },
  );

  it.each([
    // An append states only the tail of the value, so the recorded path would miss the head.
    ["x=/Users/example/keep; x+=/tmp/junk; rm -rf $x", "$x"],
    // An element assignment states no value for the variable the expansion reads.
    ["arr[0]=/tmp/junk; rm -rf $arr", "$arr"],
  ])("refuses to prove %s, whose assignment never states the whole value of %s", (command) => {
    expect(analyzeCommand(command)).toMatchObject({ kind: "approvalRequired" });
  });

  it.each([
    // Bash forks and runs a process substitution wherever the word stands, a redirection target included.
    "rm -rf /tmp/guarded < <(rm -rf build)",
    "rm -rf /tmp/guarded 3< <(rm -rf build)",
    "echo x > >(rm -rf build)",
    'd=$(mktemp -d --suffix <(rm -rf build)); rm -rf "$d"',
  ])("sends %s to approval because a process substitution runs a command of its own", (command) => {
    expect(analyzeCommand(command)).toMatchObject({ kind: "approvalRequired" });
  });

  it.each(["x='a[$(rm -rf build)]'; echo $[x]", "echo $[1+1]", 'echo "$[x]"'])(
    "refuses %s, whose deprecated `$[ ]` arithmetic the policy does not model",
    (command) => {
      expect(analyzeCommand(command)).toEqual({
        kind: "approvalRequired",
        reason: { kind: "unsupported-syntax", detail: "arithmetic" },
      });
    },
  );

  it.each(["coproc [[ x || rm -rf build ]]", 'arr["a"]=1 rm -rf /nonexistent-target'])(
    "does not hide the command in %s",
    (command) => {
      expect(analyzeCommand(command)).not.toEqual({ kind: "notDestructive" });
    },
  );

  it("reads the command after `&&` when a reserved-looking word is only an argument", () => {
    const result = analyzeCommand("echo if [[ x && rm -rf build ]]");
    expect(result.kind).toBe("temporaryCleanup");
    if (result.kind !== "temporaryCleanup") return;
    expect(result.proof.targets.map((target) => target.path)).toEqual(["build", "]]"]);
  });

  it("proves a cleanup guarded by a test expression", () => {
    expect(analyzeCommand("[[ -d /tmp/work ]] && rm -rf /tmp/work")).toMatchObject({
      kind: "temporaryCleanup",
      proof: { targets: [{ path: "/tmp/work" }] },
    });
  });

  it.each(['[[ -n "$(mktemp -d)" ]] && rm -rf /tmp/work', "rm -rf /tmp/work <(printf x)"])(
    "does not prove %s, whose substitution runs a command the proof cannot see",
    (command) => {
      expect(analyzeCommand(command)).toEqual({
        kind: "approvalRequired",
        reason: { kind: "unprovable-effects", detail: "word contains a substitution" },
      });
    },
  );
});
