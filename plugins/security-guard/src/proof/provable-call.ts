import { runsSubstitution } from "../shell/tokenizer.ts";
import { commandRule } from "../policy/command-analysis/command-registry.ts";
import {
  simpleCommandIsDestructive,
  substitutionContents,
} from "../policy/command-analysis/commands/classify-command.ts";
import { SHELL_BUILTINS, assignedName, escalatesPrivilege, isTrustedCommandWord } from "../shell/command-parser.ts";
import type { ShellToken } from "../shell/types.ts";
import {
  extractPathTargets,
  extractWriteTargets,
  PATH_TARGET_COMMANDS,
  WRITE_TARGET_COMMANDS,
} from "./path-operands.ts";
import { extractRedirectionTargets } from "./redirections.ts";
import { assignmentAt, expandWord, mktempDirectoryCommandWords } from "./shell-state.ts";
import type { ShellAst } from "../shell/ast.ts";
import { parseShell } from "../shell/parse.ts";
import {
  proven,
  unprovable,
  type DestructiveTarget,
  type ProofResult,
  type ProvableCall,
  type ShellState,
} from "./types.ts";
export type { DestructiveTarget, ProvableCall } from "./types.ts";

function isInertCommand(name: string, argTexts: readonly string[]): boolean {
  const effect = commandRule(name)?.effect;
  if (!effect || effect.kind !== "inert") return false;
  const unsafe = effect.unsafeOption;
  if (!unsafe) return true;
  for (const arg of argTexts) {
    if (arg === "--") break;
    if (arg.startsWith("-") && unsafe.test(arg)) return false;
  }
  return true;
}

// Assignments that move the temporary root, change how an unquoted expansion splits, change which binary a
// command name resolves to, or carry code the shell runs on its own. `PS4` is expanded, command substitution
// included, every time xtrace traces a command, and `PROMPT_COMMAND` runs before each prompt; a value this
// scan cannot prove would otherwise be dropped while bash still acts on it. Any of them invalidates the
// reasoning applied to the rest of the call.
const SENSITIVE_VARIABLES = new Set([
  "TMPDIR",
  "TMP",
  "TEMP",
  "IFS",
  "PATH",
  "ENV",
  "BASH_ENV",
  "PS4",
  "PROMPT_COMMAND",
]);

// The long names `set -o` and `set +o` accept. An unlisted name may not be an option name at all, which would
// make the word a positional parameter and the rest of the call something else than it reads as.
const SET_OPTION_NAMES = new Set([
  "allexport",
  "braceexpand",
  "emacs",
  "errexit",
  "errtrace",
  "functrace",
  "hashall",
  "histexpand",
  "history",
  "ignoreeof",
  "interactive-comments",
  "keyword",
  "monitor",
  "noclobber",
  "noexec",
  "noglob",
  "nolog",
  "notify",
  "nounset",
  "onecmd",
  "physical",
  "pipefail",
  "posix",
  "privileged",
  "verbose",
  "vi",
  "xtrace",
]);

// The single-letter options bash's `set` accepts, from its own usage line. A word carrying any other letter
// makes bash reject the whole call and apply none of its options, so the option state stays as it was.
const SET_OPTION_LETTERS = "abefhkmnoptuvxBCEHPT";

/**
 * Whether errexit is in effect after a `set` call, or undefined when the call is not a plain option list.
 * `--`, `-`, and a bare operand assign positional parameters, and a bare `-o` prints the settings, so none of
 * them leaves the option state readable here.
 */
function errexitAfterSet(argTexts: readonly string[], current: boolean): boolean | undefined {
  let errexit = current;
  for (let i = 0; i < argTexts.length; i += 1) {
    const arg = argTexts[i] ?? "";
    if (!/^[-+][a-zA-Z]+$/.test(arg)) return undefined;
    const enable = arg.startsWith("-");
    const letters = arg.slice(1);
    if ([...letters].some((letter) => !SET_OPTION_LETTERS.includes(letter))) return undefined;
    // xtrace expands PS4 before every traced command, command substitution included, so a PS4 inherited from
    // the host and out of this scan's sight would run once tracing is on. Enabling it is never cleanup, so the
    // call falls back to approval instead.
    if (enable && letters.includes("x")) return undefined;
    if (letters.includes("e")) errexit = enable;
    if (letters.includes("o")) {
      // `o` anywhere in a bundle takes the next word as the long option name.
      const option = argTexts[i + 1];
      if (option === undefined || !SET_OPTION_NAMES.has(option)) return undefined;
      if (enable && option === "xtrace") return undefined;
      if (option === "errexit") errexit = enable;
      i += 1;
    }
  }
  return errexit;
}

function addPathResolvedCommands(commands: Set<string>, commandWords: readonly ShellToken[]): void {
  for (const word of commandWords) {
    if (!word.text.includes("/") && !SHELL_BUILTINS.has(word.text)) commands.add(word.text);
  }
}

/**
 * Lists the paths every command in `value` can create, truncate, or remove, or undefined when the call's effect
 * cannot be proven from them. Provable calls consist only of plain `NAME=value` assignments, `set` option
 * changes, the path commands `rm`, `rmdir`, `unlink`, `truncate`, `mv`, `chmod`, and `chown` with at least one
 * operand, and inert commands that cannot create links or move files before a later command runs. Redirection
 * targets count as paths the call writes. Variables assigned earlier in the same call are expanded; any other
 * variable, `~`, or command substitution fails, except a value of exactly `$(mktemp -d ...)`, whose suffix
 * additionally needs `set -e` before it so a failed mktemp cannot leave the value empty. An assignment is only
 * carried forward when the shell is certain to run it in this shell, so a branch of `&&` or a subshell drops
 * the variable instead. Assignments to `TMPDIR`, `IFS`, `PATH`, and their kin fail the whole call, as does a
 * command run through `sudo` or `doas`. Wildcards are accepted only for `rm` and `mv` and only in the last
 * path component. Callers resolve the operands against the working directory; relative paths are returned as
 * written.
 *
 * `commands` lists every command word without a slash that is not a shell builtin, wrappers and the words of
 * a `$(mktemp -d ...)` substitution included. The rules above hold for the system executables only, and the
 * host's PATH decides which file such a word runs, so callers resolve each name with
 * `resolvesToSystemExecutable` before relying on the targets.
 */
export function proveShellEffects(ast: ShellAst, destructiveStarts: ReadonlySet<number>): ProofResult<ProvableCall> {
  const tokens = ast.tokens;
  if (tokens.some((token) => !token.sep && SENSITIVE_VARIABLES.has(assignedName(token) ?? ""))) {
    return unprovable("sensitive shell variable assignment");
  }
  // The reader of a here-document only receives data, but this shell expands an unquoted body first, so a
  // substitution there runs unseen whatever the reader is.
  if (tokens.some((token) => token.heredoc && substitutionContents(token).length > 0)) {
    return unprovable("word contains a substitution");
  }

  const state: ShellState = { variables: new Map(), errexit: false };
  const targets: DestructiveTarget[] = [];
  const commands = new Set<string>();

  for (const invocation of ast.commands) {
    const { extent, parsed, resolved: command } = invocation;

    const written = extractRedirectionTargets(parsed.redirections, state);
    if (written.kind === "unprovable") return written;
    targets.push(...written.value);
    if (parsed.words.length === 0) continue;

    const assignment = assignmentAt(parsed.words);
    if (assignment) {
      if (runsSubstitution(assignment.value)) {
        // The substitution runs `mktemp` through the host's PATH like any other command, so a look-alike
        // there could return any directory at all.
        const mktempWords = mktempDirectoryCommandWords(assignment.value);
        if (!mktempWords) return unprovable("assignment substitution cannot be proven");
        addPathResolvedCommands(commands, mktempWords);
      }
      // `export NAME=$(...)` reports the builtin's exit status, so errexit never sees the substitution fail.
      const assignmentState = assignment.viaExport ? { ...state, errexit: false } : state;
      // A conditional or subshell assignment may leave the previous value in place, so neither value is known.
      const expanded = extent.unconditional ? expandWord(assignment.value, assignmentState) : undefined;
      if (expanded?.kind === "proven") state.variables.set(assignment.name, expanded.value);
      else state.variables.delete(assignment.name);
      continue;
    }

    if (parsed.words.some(runsSubstitution)) {
      return unprovable("word contains a substitution");
    }
    // A test expression compares and runs nothing, and its substitutions were rejected just above.
    if (parsed.words.every((word) => word.testExpression)) continue;

    if (command.kind === "unresolved") return unprovable("command cannot be resolved");
    const { name, args, argTexts, commandWords, statefulWrapper } = command;
    // The operand rules below belong to the system tools; a look-alike executable obeys none of them.
    if (!commandWords.every(isTrustedCommandWord)) return unprovable("command executable is not trusted");
    if (escalatesPrivilege(commandWords)) return unprovable("command escalates privilege");
    addPathResolvedCommands(commands, commandWords);
    // A wrapper that moves the working directory or root, or writes a file of its own, puts paths outside the
    // operands the rules below read.
    if (statefulWrapper) return unprovable("wrapper has unmodeled effects");

    if (destructiveStarts.has(extent.start)) {
      if (!PATH_TARGET_COMMANDS.has(name)) return unprovable("destructive command is approval-only");
      const commandTargets = extractPathTargets(name, args, state);
      if (commandTargets.kind === "unprovable") return commandTargets;
      targets.push(...commandTargets.value);
    } else if (WRITE_TARGET_COMMANDS.has(name)) {
      const created = extractWriteTargets(name, args, state);
      if (created.kind === "unprovable") return created;
      targets.push(...created.value);
    } else if (name === "set") {
      // Only the bare builtin changes this shell's options: `env set -e`, `nice set -e`, and `/bin/set -e`
      // look for an executable that does not exist. A conditional `set` leaves the option state unknown too.
      const isBuiltin = commandWords.length === 1 && commandWords[0]?.text === "set";
      const errexit = isBuiltin && extent.unconditional ? errexitAfterSet(argTexts, state.errexit) : undefined;
      if (errexit === undefined) return unprovable("shell option state cannot be proven");
      state.errexit = errexit;
    } else if (!isInertCommand(name, argTexts)) {
      return unprovable("command has unmodeled effects");
    }
  }
  return proven({ targets, commands: [...commands] });
}

export function provableCall(value: string): ProvableCall | undefined {
  const parsed = parseShell(value);
  if (parsed.kind === "unsupported") return undefined;
  const destructiveStarts = new Set(
    parsed.ast.commands
      .filter((command) => simpleCommandIsDestructive(parsed.ast.tokens, command.extent.start, true, command.resolved))
      .map((command) => command.extent.start),
  );
  const proof = proveShellEffects(parsed.ast, destructiveStarts);
  return proof.kind === "proven" ? proof.value : undefined;
}

/** The targets of `provableCall`, for callers that resolve the command names themselves. */
export function destructiveTargets(value: string): DestructiveTarget[] | undefined {
  return provableCall(value)?.targets;
}
