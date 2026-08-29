import { describe, expect, it } from "vitest";
import { analyzeCommand } from "../../../src/policy/command-analysis/analyze-command.js";
import { isDestructiveText } from "../../../src/policy/command-analysis/commands/classify-command.js";

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
});
