import { describe, expect, it } from "vitest";
import { analyzeCommand } from "../../../src/policy/command-analysis/analyze-command.js";
import { isDestructiveText } from "../../../src/policy/command-analysis/commands/classify-command.js";
import { classifyShellAst } from "../../../src/policy/command-analysis/commands/classify-command.js";
import { proveShellEffects } from "../../../src/proof/provable-call.js";
import { parseShell } from "../../../src/shell/parse.js";

describe("analyzeCommand", () => {
  // A lone checkout operand restores a file of that name when one exists and switches branches otherwise,
  // and a third `mv` operand moves the others into the last when that is a directory. The classifier still
  // reads both as destructive, so every nested, `xargs`, and `find -exec` form keeps needing approval; at
  // the top level it hands the question to the host instead of deciding alone.
  describe("host path checks", () => {
    it.each([
      ["git checkout main", [{ path: "main", expectation: "absent" }]],
      ["git checkout HEAD~1", [{ path: "HEAD~1", expectation: "absent" }]],
      ["git checkout README.md", [{ path: "README.md", expectation: "absent" }]],
      ["git checkout Makefile", [{ path: "Makefile", expectation: "absent" }]],
      ["git checkout -q main", [{ path: "main", expectation: "absent" }]],
      ["git checkout 'my file'", [{ path: "my file", expectation: "absent" }]],
      ["git --no-pager checkout main", [{ path: "main", expectation: "absent" }]],
      ["git -c core.pager=cat checkout main", [{ path: "main", expectation: "absent" }]],
      // A literal assignment that leaves Git's context alone is inert.
      ["NODE_ENV=test git checkout main", [{ path: "main", expectation: "absent" }]],
      ["env NODE_ENV=test git checkout main", [{ path: "main", expectation: "absent" }], ["env", "git"]],
      // A word with a slash names its file, which the trust rule already confined to a system directory.
      ["/usr/bin/git checkout main", [{ path: "main", expectation: "absent" }], []],
      ["LC_ALL=C mv a.ts b.ts c.ts src/", [{ path: "src/", expectation: "directory" }]],
      ["mv a.ts b.ts c.ts src/", [{ path: "src/", expectation: "directory" }]],
      ["mv -- a.ts b.ts c.ts src", [{ path: "src", expectation: "directory" }]],
      ["mv -i a.ts b.ts c.ts ../src", [{ path: "../src", expectation: "directory" }]],
    ])("hands %s to the host", (command, checks, commands = [command.includes("mv ") ? "mv" : "git"]) => {
      expect(isDestructiveText(command)).toBe(true);
      expect(analyzeCommand(command)).toEqual({ kind: "hostPathCheck", checks, commands });
    });

    it.each([
      // Git's own leading options resolve the operand against another directory.
      "git -C sub checkout main",
      "git --git-dir=.git checkout main",
      "git --git-dir .git checkout main",
      "git --work-tree=sub checkout main",
      "git -c core.worktree=sub checkout main",
      "git --config-env=core.worktree=WT checkout main",
      // So does anything else that can move the working directory or Git's view of it.
      "cd sub && git checkout main",
      "pushd sub; git checkout main",
      "GIT_WORK_TREE=sub git checkout main",
      "env GIT_DIR=other.git git checkout main",
      "HOME=/srv/other git checkout main",
      "XDG_CONFIG_HOME=/srv/other git checkout main",
      "PATH=/srv/bin git checkout main",
      "DYLD_INSERT_LIBRARIES=/srv/x.dylib git checkout main",
      "LD_PRELOAD=/srv/x.so git checkout main",
      "export GIT_WORK_TREE=sub; git checkout main",
      "env -C sub git checkout main",
      "eval 'cd sub'; git checkout main",
      // An expansion anywhere in the command runs before it and can create the checked path.
      "X=$(printf x > main) git checkout main",
      "X=`touch main` git checkout main",
      "git checkout -q$(touch main) main",
      "git checkout --$(echo detach) main",
      "git checkout $((1)) main",
      "mv a.ts b.ts c.ts src/ $(touch src)",
      "X=$(mkdir src) mv a.ts b.ts c.ts src/",
      // The command word must obey the proof's rules: a system executable, without privilege escalation.
      "./git checkout main",
      "/opt/tools/git checkout main",
      "sudo git checkout main",
      "doas mv a.ts b.ts c.ts src/",
      "/srv/bin/mv a.ts b.ts c.ts src/",
      // The shell rewrites the operand before Git or the host sees it.
      "git checkout $BRANCH",
      'git checkout "$BRANCH"',
      "git checkout $(cat branch)",
      "git checkout ~",
      "git checkout '*'",
      "git checkout {a,b}",
      "mv a.ts b.ts c.ts $DEST",
      "mv a.ts b.ts c.ts ~/src",
      // Anything that runs before the command can create the path the host found absent.
      "git fetch origin && git checkout main",
      "printf x > main; git checkout main",
      "git checkout main && mv a.ts b.ts c.ts src/",
      "git checkout main > main",
      "git checkout main < main",
      "git checkout main <<EOF\nx\nEOF",
      "git checkout main && echo $(rm -rf build)",
      "rm -rf src && git checkout main",
      "git checkout main; git restore .",
      // Text another program parses is judged without a host.
      "bash -c 'git checkout main'",
      "eval 'git checkout main'",
      "xargs git checkout main",
      "find . -name x -exec git checkout {} \\;",
    ])("requires approval for %s without asking the host", (command) => {
      expect(analyzeCommand(command)).toMatchObject({ kind: "approvalRequired" });
    });

    it.each([
      // `-t` and `-T` change which operand is the destination.
      "mv -t src/ a.ts b.ts c.ts",
      "mv -T a.ts b.ts c.ts",
      // An option value among the non-option words is not a path operand.
      "mv -S .bak a.ts b.ts",
      "mv --suffix .bak a.ts b.ts",
      "mv -S .bak a.ts b.ts c.ts src/",
      // Fewer than two operands, or every other `mv` condition, keeps its verdict.
      "mv a.ts",
      "mv -f a.ts b.ts c.ts src/",
      "mv a.ts b.ts c.ts /srv/",
      "mv *.ts src/",
      "mv a.ts b.ts c.ts .env.d/",
      "touch src && mv a.ts b.ts c.ts src/",
    ])("leaves %s to the temporary-root proof, as before", (command) => {
      expect(analyzeCommand(command)).toMatchObject({ kind: "temporaryCleanup" });
    });

    it.each(["git checkout -b feature/x", "git checkout --detach v1.2.3", "git checkout -", "mv a.ts b.ts"])(
      "allows %s without asking the host",
      (command) => {
        expect(analyzeCommand(command)).toEqual({ kind: "notDestructive" });
      },
    );
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
