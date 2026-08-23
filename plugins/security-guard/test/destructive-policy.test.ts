import { describe, expect, it } from "vitest";
import { isDestructiveText } from "../src/policy/command-analysis/commands/classify-command.js";

const importGraphCheck = String.raw`python3 - <<'PY'
from pathlib import Path
import re
root = Path('plugins/security-guard/src')
files = list(root.rglob('*.ts'))
graph = {p: [] for p in files}
for p in files:
    for target in re.findall(r'from\s+["\'](\.[^"\']+)["\']', p.read_text()):
        q = (p.parent / target.replace('.js', '.ts')).resolve()
        if q in {f.resolve() for f in files}:
            graph[p].append(next(f for f in files if f.resolve() == q))
visiting, visited = set(), set()
def visit(p, chain):
    if p in visiting:
        raise SystemExit('cycle: ' + ' -> '.join(str(x.relative_to(root)) for x in chain + [p]))
    if p in visited: return
    visiting.add(p)
    for q in graph[p]: visit(q, chain + [p])
    visiting.remove(p); visited.add(p)
for p in files: visit(p, [])
print(f'No import cycles across {len(files)} TypeScript library files.')
PY
git diff --check`;

describe("destructive command policy", () => {
  it("does not parse Python heredoc data as shell commands", () => {
    expect(isDestructiveText(importGraphCheck)).toBe(false);
  });

  it("still detects command substitutions expanded inside heredoc data", () => {
    expect(isDestructiveText("python3 - <<EOF\n$(rm -rf build)\nEOF")).toBe(true);
  });

  it.each([
    "rm file.txt",
    "rm -rf dist",
    "sudo rm -rf dist",
    // Privilege wrappers: `doas`, environment assignments after `sudo`, and a `sudo`/`doas` shell that reads its
    // commands from standard input all once escaped detection.
    "doas rm -rf dist",
    "doas -u root rm -rf dist",
    "sudo X=1 rm -rf dist",
    "sudo -E LANG=C rm -rf dist",
    "echo 'rm -rf /' | sudo -s",
    "echo 'rm -rf /' | sudo -i",
    "echo 'rm -rf /' | sudo --shell",
    "echo 'rm -rf /' | doas -s",
    "echo 'rm -rf /' | doas sh",
    // `builtin` runs a shell builtin, `exec` among them.
    "builtin exec rm -rf dist",
    "command rm file.txt",
    "KEEP=1 rm file.txt",
    "env -i rm file.txt",
    "mv -f old new",
    "mv old /tmp/new",
    "mv *.txt docs/",
    "truncate -s 0 file.txt",
    "dd if=/dev/zero of=disk.img",
    "mkfs /dev/disk1",
    "chmod 777 file.txt",
    "chmod -R 644 dist",
    "chmod 644 .env",
    "chown root file.txt",
    "chown -R user dist",
    "git reset --hard",
    "git clean -fd",
    "git clean -df",
    "git clean -f -d",
    // `git clean` deletes untracked files whenever it runs for real: `-f` is only needed while the
    // `clean.requireForce` default holds, and `-c` can drop that guard.
    "git clean -f",
    "git clean",
    "git -c clean.requireForce=false clean",
    "git clean -x",
    "git clean --force -d",
    "git clean -fdx",
    "git push --force",
    "git push -f",
    "git push -fu origin main",
    "git push --force-with-lease=main origin main",
    "git push --force-if-includes",
    "git push origin +main",
    "git push origin +main:main",
    "git push origin :old-branch",
    "git push --delete origin old-branch",
    "git push -d origin old-branch",
    "git push --mirror",
    "git push --prune origin",
    // GNU accepts any unambiguous prefix of a long option.
    "git push --mir",
    "git push --for",
    "git push --del origin old-branch",
    "mv --for old new",
    "mv --f old new",
    // `--reference` copies a mode or owner this text never shows.
    "chmod --reference=/tmp/r file.txt",
    "chmod --ref=/tmp/r file.txt",
    "chmod --reference /tmp/r file.txt",
    "chown --reference=/tmp/r file.txt",
    "chown --ref /tmp/r file.txt",
    "chmod --rec 644 dist",
    // Long-form and bundled `mv` force, and octal or symbolic modes that grant write.
    "mv --force old new",
    "mv -if old new",
    "chmod 0777 file.txt",
    "chmod 00666 file.txt",
    "chmod 0666 file.txt",
    "chmod a=rwx file.txt",
    "chmod o+rw file.txt",
    "chmod u+x,o+w file.txt",
    "bash -lc 'rm file.txt'",
    "find . -name '*.tmp' -exec rm {} ;",
    "find . -name '*.tmp' -execdir rm {} +",
    "printf '%s\n' file.txt | xargs rm",
    "printf '%s\n' file.txt | xargs -I {} rm {}",
    // A heredoc body is read as commands, so a destructive line inside one still asks.
    "cat <<'EOF'\nrm -rf build\nEOF",
    // A leading redirection must not hide the command word behind it.
    ">/tmp/log rm -rf build",
    "2>/dev/null rm -rf build",
    // A wrapper option that takes a value once made `10` look like the command name.
    "nice -n 10 rm -rf build",
    "sudo -u root rm -rf build",
    "nice -10 rm -rf build",
    "sudo -- rm -rf build",
    "env -u FOO rm -rf build",
    // An unrecognized wrapper option leaves the command word unknown, so the call is treated as destructive.
    "nice --unknown echo hi",
    "env -S 'rm -rf build'",
    // A wrapper option that moves the working directory still resolves to the command it runs.
    "env -C /Users/example rm -rf Documents",
    "sudo -D /Users/example rm -rf Documents",
    "/usr/bin/time -o /Users/example/probe rm -rf build",
    // An xargs option taking a value once made `1` and `{}` look like the command word.
    "printf '%s\n' probe | xargs -n 1 rm -rf",
    "printf '%s\n' probe | xargs -L1 rm -rf",
    "printf '%s\n' probe | xargs --max-args=1 rm -rf",
    "printf '%s\n' probe | xargs -I{} rm -rf {}",
    // GNU's `-i`, `-l`, and `--max-lines` take an optional value, so which word is the command cannot be decided.
    "printf '%s\n' probe | xargs -i rm {}",
    "printf '%s\n' probe | xargs -l rm probe",
    "printf '%s\n' probe | xargs --max-lines rm probe",
    "printf '%s\n' probe | xargs --unknown rm {}",
    // eval joins its operands and runs the result.
    'eval "rm -rf /Users/example/project"',
    "eval rm -rf build",
    "eval 'rm' '-rf' build",
    // An operand that still expands hides what eval would run.
    'eval "$command"',
    "eval $command",
    // A command word that still expands names a command the text never shows.
    'c="rm -rf /Users/example/project"; bash -c "$c"',
    'bash -c "$c"',
    'sh -c "$c"',
    'zsh -c "$c"',
    "$c",
    "$c /Users/example/project",
    "`printf rm` -rf build",
    "printf 'x' | xargs $c",
    "find . -exec $c {} ;",
    // A nested-shell operand before the script decides how that shell reads it.
    "bash $opts -c 'echo hi'",
    "bash $script",
    // A shell with no script operand runs whatever reaches its standard input.
    "bash",
    "bash -s",
    "bash <<< 'rm -rf build'",
    "echo 'rm -rf build' | bash",
    "ksh -c 'rm -rf build'",
    "dash -c 'rm -rf build'",
    // The outer shell expands the script before the nested shell parses the result.
    'x="; rm -rf build"; bash -c "echo $x"',
    'sh -c "ls $dir"',
    // find primaries that remove or write a file of their own.
    "find . -name '*.tmp' -delete",
    "find . -name '*.tmp' -fprint /Users/example/probe",
    // A reserved word introduces the command; it is not one itself.
    "if true; then rm -rf build; fi",
    "if false; then :; else rm -rf build; fi",
    "if false; then :; elif true; then rm -rf build; fi",
    "for f in a; do rm -rf build; done",
    "while true; do rm -rf build; break; done",
    "until false; do rm -rf build; break; done",
    "case x in a) rm -rf build;; esac",
    "! rm -rf build",
    "coproc rm -rf build",
    // Brace expansion rewrites the command word before the shell resolves a name.
    "r{m,} -rf build",
    "{rm,zz} -rf build",
    // Commands that run another one and were once read as the command themselves.
    "exec rm -rf build",
    "exec -a name rm -rf build",
    "timeout 5 rm -rf build",
    "timeout -s KILL 5 rm -rf build",
    "timeout --signal=KILL 5s rm -rf build",
    "stdbuf -o0 rm -rf build",
    "setsid rm -rf build",
    "timeout --unknown 5 ls",
    // A quoted delimiter is data, so the substitution ends at the last parenthesis, not the quoted one.
    'echo $(echo ")" ; rm -rf build)',
    "echo $(echo ')' ; rm -rf build)",
    'echo $(: ")" ; rm -rf build)',
    // The shell keeps reading options after `-c`, so the script is not always the word after it.
    "bash -co pipefail 'rm -rf build'",
    "bash -c -o pipefail 'rm -rf build'",
    "bash -c -- 'rm -rf build'",
    "echo 'rm -rf build' | bash -O extglob",
    "echo 'rm -rf build' | bash --rcfile /dev/null",
    "bash -s -",
    // A trap handler runs when the shell exits, which the agent's shell always does.
    "trap 'rm -rf build' EXIT",
    "trap -- 'rm -rf build' EXIT",
    // Removal commands that are not `rm`, and Git subcommands that overwrite the working tree.
    "unlink build/probe",
    // A case-insensitive filesystem runs `/bin/RM` as `rm`.
    "RM -rf build",
    "Rm -rf build",
    "/bin/RM -rf build",
    "SUDO rm -rf build",
    "rmdir build",
    "shred -u build/probe",
    "git rm -rf .",
    "git restore .",
    "git checkout .",
    "git checkout -- src/index.ts",
    "git checkout src/index.ts",
    "git worktree remove --force wt",
    // A lone checkout operand restores a file of that name when no such branch exists, which cannot be known
    // without the repository; a second operand is always a pathspec, `-f` discards local changes even when
    // switching branches, and `-B` resets an existing branch to the start point.
    "git checkout main",
    "git checkout README.md",
    "git checkout Makefile",
    "git checkout main README.md",
    "git checkout -f main",
    "git checkout --force main",
    "git checkout -B feature",
    "git checkout -B feature origin/main",
    "git checkout -qB feature",
    "git checkout --ours Makefile",
    "git checkout --pathspec-from-file=paths.txt",
    // Git's own options stand before the subcommand; an unknown one could take the subcommand as its value.
    "git -C repo restore .",
    "git -C repo reset --hard",
    "git --git-dir=.git --work-tree=. checkout -- src",
    "git -c core.pager=cat clean -fd",
    "git --no-pager rm -r src",
    "git --unknown-option status",
  ])("requires approval for %s", (text) => {
    expect(isDestructiveText(text)).toBe(true);
  });

  it.each([
    "echo rm",
    "grep mv README.md",
    "mv old new",
    "chmod 644 file.txt",
    "chmod 0644 file.txt",
    "chmod u+x file.txt",
    "chmod a=rx file.txt",
    "git clean -n",
    "git clean --dry-run",
    "git clean -nd",
    "git push origin main",
    "git push origin main:main",
    "chown user file.txt",
    // `command -v` and `command -V` print where the name resolves and run nothing.
    "command -v rm",
    "command -V rm -rf dist",
    "command -pv rm",
    "printf '%s\n' rm | xargs echo",
    "printf '%s\n' rm | xargs -n 1 echo",
    "printf '%s\n' rm | xargs -0 -- echo",
    "env -C /Users/example ls",
    "set -e",
    "set -euo pipefail",
    'eval "echo hi"',
    "eval",
    // A single-quoted `$` reaches the nested shell as itself, and an argument is not a command word.
    "bash -c 'echo $HOME'",
    // The operands after the script become `$0` and the positional parameters of the nested shell.
    'bash -c \'echo hi\' "$extra"',
    'bash -c \'grep "$1" f\' _ "$pattern"',
    "timeout 5 ls",
    "timeout -s KILL 5 ls",
    "exec ls",
    "stdbuf -o0 grep x file.txt",
    "{ echo hi; }",
    "if true; then echo hi; fi",
    "git checkout -b feature",
    "git checkout -b feature origin/main",
    "git checkout --track origin/feature",
    "git checkout --detach v1.2.3",
    "git checkout -",
    "git -C repo status",
    "git -C repo checkout -b feature",
    "git --no-pager log",
    "trap 'echo done' EXIT",
    "echo $(echo ')')",
    "# just a comment",
    "echo hi # rm -rf build",
    "bash -c 'awk \"{print $1}\" file.txt'",
    "bash script.sh",
    "bash script.sh arg",
    "grep $pattern file.txt",
    'echo "a>b"',
    "awk '{print $1}' file.txt",
    "cat <<'EOF'\nhello\nEOF",
    "echo x > rm",
  ])("does not require approval for %s", (text) => {
    expect(isDestructiveText(text)).toBe(false);
  });

  it.each(["echo $(rm -rf build)", "x=`rm -rf build`", "echo $(echo $(rm -rf build))"])(
    "detects destructive commands inside substitutions in %s",
    (command) => {
      expect(isDestructiveText(command)).toBe(true);
    },
  );

});
