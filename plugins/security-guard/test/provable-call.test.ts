import { describe, expect, it } from "vitest";
import { destructiveTargets, provableCall } from "../src/proof/provable-call.js";

describe("provable calls", () => {
  const literal = (path: string, followsLinks = false) => ({ path, insideMktempDirectory: false, followsLinks });
  const mktemp = (path: string, followsLinks = false) => ({ path, insideMktempDirectory: true, followsLinks });

  it.each([
    ["rm -rf build", [literal("build")]],
    ["rm -rf -- -weird", [literal("-weird")]],
    ["\n rm -rf '/tmp/work 1' /tmp/work2 \n", [literal("/tmp/work 1"), literal("/tmp/work2")]],
    ["rm -rf build; rm file.txt", [literal("build"), literal("file.txt")]],
    ["rm -rf build && echo done", [literal("build")]],
    ["FOO=1 env -i rm build", [literal("build")]],
    ["rm -rf ./* build/*.o", [literal("./*"), literal("build/*.o")]],
    ["mv -t out a b", [literal("out"), literal("a"), literal("b")]],
    ["mv --target-directory=out a", [literal("out"), literal("a")]],
    ["mv -ft out a", [literal("out"), literal("a")]],
    ["mv -tout a", [literal("out"), literal("a")]],
    ["mv -S .bak -f a b", [literal("a"), literal("b")]],
    // A bundle ends at its first value option, so `-ftS` is `-f -t S` and every operand is a source.
    ["mv -ftS a b", [literal("S"), literal("a"), literal("b")]],
    ["mv -tS /Users/example/id_rsa /tmp/x", [literal("S"), literal("/Users/example/id_rsa"), literal("/tmp/x")]],
    ["! rm -rf build", [literal("build")]],
    ["coproc rm -rf build", [literal("build")]],
    ["exec rm -rf build", [literal("build")]],
    ["timeout 5 rm -rf build", [literal("build")]],
    ["unlink build/probe", [literal("build/probe")]],
    ["rmdir -v build/out", [literal("build/out")]],
    ["rmdir --verbose --ignore-fail-on-non-empty build/out", [literal("build/out")]],
    ["rm --recursive --force --interactive=never dist", [literal("dist")]],
    ["truncate --size 0 --reference=ref log.txt", [literal("log.txt", true)]],
    // An abbreviation of a known long option resolves to it, value included.
    ["rm --rec --for dist", [literal("dist")]],
    ["truncate --siz 0 log.txt", [literal("log.txt", true)]],
    ["truncate --ref ref log.txt", [literal("log.txt", true)]],
    // A bare `-` names a file called `-`, so it is a target like any other operand.
    ["mv - out/", [literal("-"), literal("out/")]],
    ["rm -rf -", [literal("-")]],
    // A comment is not an operand, and the newline that ends it still separates commands.
    ["# clean up\nrm -rf build", [literal("build")]],
    ["rm -rf build # clean up", [literal("build")]],
    ["setsid rm -rf build", [literal("build")]],
    ["mv --target-directory=/Users/example source", [literal("/Users/example"), literal("source")]],
    ["mv -t /Users/example source", [literal("/Users/example"), literal("source")]],
    [
      "mkdir -p out; touch out/a; printf '%s' x > out/b; rm -rf out; exit 0",
      [literal("out", true), literal("out/a", true), literal("out/b", true), literal("out")],
    ],
    // touch and mkdir create exactly their operands, so those paths are checked like a removal target.
    ["rm -rf local; touch /Users/example/probe", [literal("local"), literal("/Users/example/probe", true)]],
    ["rm -rf local; mkdir -m 700 /Users/example/made", [literal("local"), literal("/Users/example/made", true)]],
    ["rm -rf local; touch -r ref out/a", [literal("local"), literal("out/a", true)]],
    ["/bin/rm -rf build", [literal("build")]],
    ["/usr/bin/env rm -rf build", [literal("build")]],
    // A wrapper option taking a value once made `10` and `root` look like the command word.
    ["nice -n 10 rm -rf build", [literal("build")]],
    ["nice -10 rm -rf build", [literal("build")]],
    [">log rm -rf build", [literal("log", true), literal("build")]],
    ["rm -rf build > log.txt 2>&1", [literal("log.txt", true), literal("build")]],
    ["rm -rf build 2>/dev/null; echo done >> out/log", [literal("build"), literal("out/log", true)]],
    ["rm -rf build >/dev/null 2>&1", [literal("build")]],
    ["rm -rf build > /dev/stderr", [literal("build")]],
    ["rm -rf build < input.txt", [literal("build")]],
    // A redirection writes a path the destructive command never names, so it is listed as a target.
    ["rm -rf build; echo x > /Users/example/probe", [literal("build"), literal("/Users/example/probe", true)]],
    ["rm -rf build; echo x >> /Users/example/probe", [literal("build"), literal("/Users/example/probe", true)]],
    ["rm -rf build; echo x >| /Users/example/probe", [literal("build"), literal("/Users/example/probe", true)]],
    ["rm -rf build; echo x &> /Users/example/probe", [literal("build"), literal("/Users/example/probe", true)]],
    ['set -e; d=$(mktemp -d); printf \'%s\' x > "$d/log"; rm -rf "$d"', [mktemp("/log", true), mktemp("")]],
    ['set -o errexit\nd=$(mktemp -d)\ntouch "$d/probe"\nrm -rf "$d"', [mktemp("/probe", true), mktemp("")]],
    ['set -euo pipefail; d=$(mktemp -d); rm -rf "$d/probe"', [mktemp("/probe")]],
    // A suffix is only unprovable while mktemp may have failed; the directory itself never needs the guard.
    ['set +e; d=$(mktemp -d); rm -rf "$d"', [mktemp("")]],
    // Only enabling xtrace fails the call; disabling it expands no PS4, so the proof still holds.
    ["set +x; rm -rf build", [literal("build")]],
    ["false && rm -rf build", [literal("build")]],
    ["probe=build; false && rm -rf $probe", [literal("build")]],
    ["[ -d out ] && rm -rf out || true", [literal("out")]],
    ["mv -f old new", [literal("old"), literal("new")]],
    // truncate, chmod, and chown act on what a symlink operand points to; rm and mv act on the link itself.
    ["truncate -s 0 log.txt", [literal("log.txt", true)]],
    ["truncate --size=0 -r ref log.txt", [literal("log.txt", true)]],
    ["chmod 777 file.txt", [literal("file.txt", true)]],
    ["chown root file.txt", [literal("file.txt", true)]],
    ["rm -rf build; echo x > log", [literal("build"), literal("log", true)]],
    // A heredoc reads data and names no path; a quoted body keeps its `$(` literal.
    ["rm -rf build; cat <<EOF\nx\nEOF", [literal("build")]],
    ["rm -rf build; cat <<'EOF'\n$(rm -rf /Users/example/important)\nEOF", [literal("build")]],
    ["cat <<EOF; rm -rf build\nx\nEOF", [literal("build")]],
    ["echo start; rm file.txt", [literal("file.txt")]],
    ["ls -la", []],
    ['probe="lint-parity-probe.tsx"\nrm "$probe"', [literal("lint-parity-probe.tsx")]],
    ["export probe=build; rm -rf ${probe}/out", [literal("build/out")]],
    ['dir=build; probe="$dir/probe.txt"; rm "$probe"', [literal("build/probe.txt")]],
    // Quoting makes a process substitution a literal operand: bash hands `rm` the text and runs nothing.
    ["rm -rf build '<(printf x)'", [literal("build"), literal("<(printf x)")]],
    ['rm -rf build "<(printf x)"', [literal("build"), literal("<(printf x)")]],
    ["rm -rf build \\<\\(x\\)", [literal("build"), literal("<(x)")]],
    ["set -e; d=$(mktemp -d --suffix '<(x)'); rm -rf \"$d\"", [mktemp("")]],
    ['set -e; d=$(mktemp -d --suffix "<(x)"); rm -rf "$d"', [mktemp("")]],
    ['d=$(mktemp -d)\nrm -rf "$d"', [mktemp("")]],
    ['set -e; d="$(mktemp -d)"; sub="$d/sub"; rm -rf "$sub"', [mktemp("/sub")]],
  ])("lists the path targets of %s", (command, expected) => {
    expect(destructiveTargets(command)).toEqual(expected);
  });

  it.each([
    "rm -rf",
    "rm -rf build; dd if=/dev/zero of=disk",
    "mkfs /dev/sda1",
    "git reset --hard",
    "git clean -fd",
    "git push --force",
    "bash -c 'rm -rf build'",
    "xargs rm -rf",
    "find . -name '*.o' -exec rm {} \\;",
    'rm "$probe"',
    "rm -rf ${DIR}/build",
    "rm -rf `pwd`/build",
    "rm -rf $(pwd)/build",
    "echo $(rm -rf /Users/example/project); rm -rf local.txt",
    "x=`rm -rf /Users/example/project`; rm -rf local.txt",
    "rm -rf local.txt; echo `date`",
    "rm -rf escape; ln -s / escape; rm -rf escape/etc",
    "cd /; rm -rf etc",
    "cp -P link escape; rm -rf escape/etc",
    "tar -xf archive.tar; rm -rf out/etc",
    "git clone repo; rm -rf repo",
    "rm -rf */*",
    "rm -rf **",
    "rm -rf build/**/*.o",
    "rm -rf */../../etc",
    "mv --backup=numbered a b",
    "rm -rf ~/build",
    "probe=~/build; rm -rf $probe",
    'probe="$HOME/build"; rm -rf "$probe"',
    "probe=$(pwd)/build; rm -rf $probe",
    "rm -rf $probe; probe=build",
    "probe=build\nprobe=$(pwd)\nrm -rf $probe",
    // A recursive mode change reaches every entry below the operand, and a hard link among them shares its
    // inode with a name that may lie outside the temporary root.
    "chmod -R 755 build",
    "chmod --recursive 755 build",
    "chown -R user:group build",
    "chmod -R -H 755 tree",
    "chmod -R -L 755 tree",
    "chmod -RL 755 tree",
    "chown -R -L user tree",
    "chown -R --dereference user tree",
    // GNU `diff --output` writes a file that is not an operand, under any prefix of the name.
    "diff --output=/Users/example/out a b; rm -rf tree",
    "diff --out /Users/example/out a b; rm -rf tree",
    // `sort` runs `--compress-program` and spills into temporary files its operands do not name.
    "sort --out /Users/example/out a; rm -rf tree",
    "sort input; rm -rf tree",
    "sort --compress-program=/Users/example/helper input > sorted; rm -rf tree",
    // `command -v mktemp -d` assigns `/usr/bin/mktemp`, and creates no directory.
    'd=$(command -v mktemp -d); rm -rf "$d"',
    'd=$(command -V mktemp -d); rm -rf "$d"',
    'd=$(command -pv mktemp -d); rm -rf "$d"',
    "d=$(mktemp -d); rm -rf /tmp/$d",
    "d=$(mktemp -d -p /Users/example); rm -rf $d",
    "d=$(mktemp -d --tmpdir=/Users/example); rm -rf $d",
    "d=$(mktemp -d /Users/example/XXXX); rm -rf $d",
    "d=$(mktemp -d work.XXXX); rm -rf $d",
    "d=$(mktemp); rm -rf $d",
    "d=$(mktemp -d; echo /); rm -rf $d",
    "truncate -s 0 *.log",
    // `rmdir -p` also removes every ancestor the operand names, up to the temporary root itself.
    "rmdir -p build/out",
    "rmdir --parents build/out",
    "rmdir -vp build/out",
    "rmdir --parent build/out",
    "rmdir --p build/out",
    // An unknown or abbreviated long option could take an operand or add a path, so it fails the proof.
    "rm --unknown dist",
    "unlink --x build/probe",
    "truncate --unknown 0 log.txt",
    "chmod -R 755 build/*",
    "chown -R user *",
    "chmod -R 755",
    // A branch, a subshell, a pipeline, and a background list all leave the earlier value in place.
    'd=/; false && d=$(mktemp -d); rm -rf "$d/etc"',
    'd=/; true || d=$(mktemp -d); rm -rf "$d/etc"',
    'd=/; (d=$(mktemp -d)); rm -rf "$d/etc"',
    'd=/; { d=$(mktemp -d); }; rm -rf "$d/etc"',
    'd=$(mktemp -d) | cat; rm -rf "$d/etc"',
    'd=$(mktemp -d) & rm -rf "$d/etc"',
    // Builtins that write a shell variable or a file are not inert.
    'd=$(mktemp -d); printf -v d /; rm -rf "$d/etc"',
    'd=$(mktemp -d); sort -o /Users/example/probe input; rm -rf "$d"',
    // An unquoted expansion whose value has whitespace splits into several operands.
    'p="safe /Users/example/probe"; rm -rf $p',
    "p='a b'; rm -rf $p",
    // A single-quoted or escaped `$` is a literal character, not the variable this call assigned.
    "d=$(mktemp -d); rm -rf '$d/etc'",
    "d=$(mktemp -d); rm -rf \\$d/etc",
    // A quoted name is a command, not an assignment.
    'd=$(mktemp -d); "d"=/; rm -rf "$d/etc"',
    // Any assignment that moves the temporary root, changes splitting, or changes command resolution.
    'export TMPDIR=/Users/example; d=$(mktemp -d); rm -rf "$d"',
    'TMP=/Users/example; d=$(mktemp -d); rm -rf "$d"',
    'd=$(TMPDIR=/Users/example mktemp -d); rm -rf "$d"',
    'd=$(env TMPDIR=/Users/example mktemp -d); rm -rf "$d"',
    "IFS=/; p=build; rm -rf $p",
    'PATH=/Users/example/bin; d=$(mktemp -d); rm -rf "$d"',
    // Variables bash runs on its own fail closed even when this scan cannot read their value: xtrace expands
    // PS4 (a command substitution hidden in ANSI-C quoting included), and PROMPT_COMMAND runs before a prompt.
    "PS4=$'\\x24(echo pwned)'; set -x; rm -rf /tmp/work",
    "PS4=whatever; rm -rf /tmp/work",
    "PROMPT_COMMAND=whatever; rm -rf /tmp/work",
    // Enabling xtrace expands an inherited PS4 this scan never sees, so a `set -x` fails the whole call.
    "set -x; rm -rf /tmp/work",
    'set -ex; d=$(mktemp -d); rm -rf "$d"',
    "set -o xtrace; rm -rf /tmp/work",
    // A descriptor duplication whose target is a path, and a dynamic or wildcard target.
    "rm -rf build; echo x >& /Users/example/probe",
    "rm -rf build; echo x > $undefined",
    "rm -rf build; echo x > out/*",
    // This shell expands an unquoted heredoc body, so a substitution there runs whatever reads the body.
    "rm -rf build; cat <<EOF\n$(rm -rf /Users/example/important)\nEOF",
    "rm -rf build; cat <<EOF\n`rm -rf /Users/example/important`\nEOF",
    "cat <<EOF; rm -rf build\n$(rm -rf /Users/example/important)\nEOF",
    // A command word naming an executable the agent can write obeys none of the operand rules above.
    "./rm local",
    "bin/rm local",
    "/usr/local/bin/rm local",
    "rm -rf local; ./touch probe",
    "./sudo rm -rf local",
    // Another user's entries in the shared temporary root are not this session's workspace.
    "sudo rm -rf local",
    "sudo -u root rm -rf build",
    "doas rm -rf local",
    "nice sudo rm -rf local",
    'd=$(sudo mktemp -d); rm -rf "$d"',
    // An unquoted process substitution runs its command list wherever the word stands.
    "rm -rf build <(rm -rf /Users/example/important)",
    'rm -rf build "$(printf x)<(y)"',
    // A substitution anywhere in the call runs before the proof sees it, a reading redirection included.
    'rm -rf local < "$(rm -rf /Users/example/important)"',
    "rm -rf local <<< $(rm -rf /Users/example/important)",
    'd=$(mktemp -d --suffix $(rm -rf /Users/example/important)); rm -rf "$d"',
    'd=$(mktemp -d --suffix "$(rm -rf /Users/example/important)"); rm -rf "$d"',
    'd=$(mktemp -d --suffix $x); rm -rf "$d"',
    // A `$` quoted apart from the name after it is literal to bash, so the operand is not the assigned value.
    'a=/tmp/x; rm -rf "$"{a}',
    'a=/tmp/x; rm -rf "$"a',
    'a=/tmp/x; rm -rf $"{a}"',
    // Quoting the substitution makes bash assign the text itself, not a fresh temporary directory.
    `d='$(mktemp -d)'; rm -rf "$d"`,
    'd=\\$(mktemp -d); rm -rf "$d"',
    // An option outside the known table could consume an operand or add a path of its own.
    "rm -rf local; touch --unknown probe",
    "rm -rf local; mkdir -pv out",
    "rm -rf local; touch out/*",
    // The created path is only known to bash, so an unquoted expansion of it could split.
    "d=`mktemp -d`; rm -rf $d/build",
    "d=$(mktemp -d); rm -rf $d",
    // mktemp options outside the known set could create elsewhere, create nothing, or fail.
    'd=$(mktemp -d --definitely-invalid); rm -rf "$d/etc"',
    'd=$(mktemp -du); rm -rf "$d"',
    'd=$(./mktemp -d); rm -rf "$d"',
    'd=$(mktemp -dtwork); rm -rf "$d"',
    // An unrecognized wrapper option leaves the command word unknown.
    "nice --unknown rm -rf build",
    "timeout --unknown 5 rm -rf build",
    // An option could be the mode itself or supply it, which would make the first operand a path.
    "chmod -R -w /Users/example/secret /tmp/safe",
    "chmod --reference=/tmp/ref -R /Users/example/.ssh /tmp/x",
    "chown --reference=/tmp/ref -R /Users/example/.ssh /tmp/x",
    "chmod -Rw local",
    // Brace expansion and reserved words leave a command word this text does not show.
    "r{m,} -rf build",
    "{rm,zz} -rf build",
    "for f in a; do rm -rf $f; done",
    // Brace expansion turns one operand into several, and the checked path into none of them.
    "chmod -R 777 /tmp/work/{x,..}/..",
    "rm -rf /tmp/work/{a,..}",
    "touch /tmp/work/{a,b}",
    // A `}` outside command position is an operand, and bash removes a file named `}`.
    "rm -rf /tmp/work/x }",
    // A trap handler and a shred target are never provable.
    "rm -rf build; trap 'echo done' EXIT",
    "shred -u build/probe",
    // `export NAME=$(...)` reports the builtin's exit status, so errexit never sees the substitution fail.
    'set -e; export d=$(mktemp -d); rm -rf "$d/probe"',
    'set -e; export d=$(mktemp -d); touch "$d/probe"',
    // Only the bare builtin changes this shell's options.
    'env set -e; d=$(mktemp -d); rm -rf "$d/probe"',
    'nice set -e; d=$(mktemp -d); rm -rf "$d/probe"',
    'command set -e; d=$(mktemp -d); rm -rf "$d/probe"',
    '/bin/set -e; d=$(mktemp -d); rm -rf "$d/probe"',
    // bash rejects the whole `set` call on an unknown option letter and applies none of its options.
    'set -eZ; d=$(mktemp -d); rm -rf "$d/probe"',
    'set -e -Z; d=$(mktemp -d); rm -rf "$d/probe"',
    'set -Z -e; d=$(mktemp -d); rm -rf "$d/probe"',
    // `mktemp -t` concatenates its prefix onto the temporary root without rejecting a separator.
    'set -e; d=$(mktemp -d -t ../escape); rm -rf "$d"',
    'set -e; d=$(mktemp -dt work); rm -rf "$d"',
    'set -e; d=$(mktemp -d -t work); rm -rf "$d/probe"',
    // eval runs text this proof never reads as a command.
    'rm -rf build; eval "echo done"',
    'eval "rm -rf /Users/example/project"',
    // A wrapper option that moves the working directory or root leaves the operands resolved against the
    // wrong directory, and one that writes a file adds a target no operand names.
    "env -C /Users/example rm -rf Documents",
    "env --chdir=/Users/example rm -rf Documents",
    "sudo -D /Users/example rm -rf Documents",
    "sudo --chdir /Users/example rm -rf Documents",
    "sudo -R /Users/example rm -rf Documents",
    "sudo -i rm -rf Documents",
    "sudo -bi rm -rf Documents",
    "time -o /Users/example/probe rm -rf build",
    "time --output=/Users/example/probe rm -rf build",
    // nohup writes `nohup.out` in the working directory when standard output is a terminal.
    "nohup rm -rf build",
    'd=$(env -C / mktemp -d); rm -rf "$d"',
    // Without errexit a failed mktemp leaves the variable empty and bash reads the suffix from the root.
    'd=$(mktemp -d); touch "$d/probe"',
    'd=$(mktemp -d); rm -rf "$d/probe"',
    'd=$(mktemp -d); printf \'%s\' x > "$d/log"; rm -rf "$d"',
    'd="$(mktemp -dt work)"; sub="$d/sub"; rm -rf "$sub"',
    // errexit must already hold when mktemp runs, and `set +e` before it takes the guard away again.
    'd=$(mktemp -d); set -e; rm -rf "$d/probe"',
    'set -e; set +e; d=$(mktemp -d); rm -rf "$d/probe"',
    'set -e; set +o errexit; d=$(mktemp -d); rm -rf "$d/probe"',
    '[ -d out ] && set -e; d=$(mktemp -d); rm -rf "$d/probe"',
    // A `set` call that is not a plain option list leaves the option state unreadable.
    'set -- -e; d=$(mktemp -d); rm -rf "$d/probe"',
    'set -o; d=$(mktemp -d); rm -rf "$d/probe"',
    "set -o definitely-invalid; rm -rf build",
    "set -e extra; rm -rf build",
  ])("cannot prove the targets of %s", (command) => {
    expect(destructiveTargets(command)).toBeUndefined();
  });

  it.each([
    ["rm -rf build", ["rm"]],
    ["chmod -H 777 tree", ["chmod"]],
    ["diff a b; rm -rf tree", ["diff", "rm"]],
    ["timeout 5 nice rm -rf build", ["timeout", "nice", "rm"]],
    // `time` is a reserved word bash never resolves through PATH.
    ["time rm -rf build", ["rm"]],
    ["command rm -rf build", ["rm"]],
    ["/bin/rm -rf build", []],
    ["set -e; echo start; printf x; rm -rf build; rm -rf out", ["rm"]],
    // The substitution resolves `mktemp` and its wrappers through PATH just like a command of the call.
    ['d=$(mktemp -d); rm -rf "$d"', ["mktemp", "rm"]],
    ['d=`nice mktemp -d`; rm -rf "$d"', ["nice", "mktemp", "rm"]],
    ['d=$(/usr/bin/mktemp -d); rm -rf "$d"', ["rm"]],
  ])("lists the PATH-resolved command names of %s", (command, expected) => {
    expect(provableCall(command)?.commands).toEqual(expected);
  });
});
