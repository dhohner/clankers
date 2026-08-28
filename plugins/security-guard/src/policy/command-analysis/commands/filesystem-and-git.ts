import { commandRule, type ClassificationOptions } from "../command-registry.ts";
import { expandsBeforeUse } from "./nested-shell.ts";
import { extractPathOperands } from "../../../proof/path-operands.ts";
import { skipOptionsOf, spellsLongOption } from "../../../shell/option-scanner.ts";
import type { ShellToken } from "../../../shell/types.ts";
import type { HostPathCheck } from "../result.ts";

/**
 * What one command's operands say about it: harmless, needing approval, or needing approval unless the host
 * confirms one fact about a path that this text alone cannot settle.
 */
export type ClassificationVerdict =
  | { kind: "safe" }
  | { kind: "approval" }
  | { kind: "host-check"; check: HostPathCheck };

const SAFE: ClassificationVerdict = { kind: "safe" };
const APPROVAL: ClassificationVerdict = { kind: "approval" };

type GitClassificationOptions = Extract<ClassificationOptions, { kind: "git" }>;

function gitOptions(): GitClassificationOptions {
  const options = commandRule("git")?.classificationOptions;
  if (!options || options.kind !== "git") throw new Error("The git command rule must declare classification options");
  return options;
}

/**
 * Whether the host can look `word` up as the path this text spells. An expansion, a tilde, a glob, or a brace
 * is replaced by the shell first, so the entry the command reaches is not the one the host would inspect.
 */
function namesOnePathLiterally(word: ShellToken): boolean {
  return word.text !== "" && !expandsBeforeUse(word) && !/^~|[*?[{}]/.test(word.text);
}

/**
 * Whether a `git checkout` can overwrite working-tree files or move an existing branch. Creating a branch
 * with `-b`, tracking one, or detaching does neither, and Git refuses a switch that would lose local changes,
 * unless `-f` discards them. `-B` resets a branch that already exists to the start point and checks it out.
 * A lone operand is a branch to Git only when no file of that name exists in the working directory, which
 * only the host can check, so it becomes a host check for that path being absent; a second operand is always
 * a pathspec after a tree-ish.
 */
function checkoutVerdict(args: readonly ShellToken[], options: GitClassificationOptions): ClassificationVerdict {
  const operands: ShellToken[] = [];
  let namesBranch = false;
  for (let i = 0; i < args.length; i += 1) {
    const word = args[i];
    const arg = word?.text ?? "";
    if (arg === "--" || options.checkoutDestructive.test(arg) || /^-[A-Za-z]*[fB]/.test(arg)) return APPROVAL;
    if (word && (arg === "-" || !arg.startsWith("-"))) {
      operands.push(word);
      continue;
    }
    if (options.checkoutBranch.has(arg)) namesBranch = true;
    if (options.checkoutBranchValue.has(arg)) i += 1;
  }
  if (namesBranch) return SAFE;
  if (operands.length > 1) return APPROVAL;
  const operand = operands[0];
  if (operand === undefined || operand.text === "-") return SAFE;
  if (!namesOnePathLiterally(operand)) return APPROVAL;
  return { kind: "host-check", check: { path: operand.text, expectation: "absent" } };
}

/**
 * Whether Git's own options, which stand before the subcommand, make Git resolve a checkout operand against
 * a directory other than the shell's working directory: `-C` moves it, `--git-dir` and `--work-tree` move
 * the repository, and `core.worktree` set through `-c` or `--config-env` moves the working tree.
 */
function movesGitDirectory(leading: readonly string[]): boolean {
  for (let i = 0; i < leading.length; i += 1) {
    const arg = leading[i] ?? "";
    if (arg.startsWith("-C") || /^--(git-dir|work-tree)(=|$)/.test(arg)) return true;
    const inline = arg.startsWith("--config-env=") ? arg.slice("--config-env=".length) : undefined;
    const value = inline ?? (arg === "-c" || arg === "--config-env" ? (leading[i + 1] ?? "") : undefined);
    if (value !== undefined && /^core\.worktree(=|$)/i.test(value)) return true;
  }
  return false;
}

/** Whether `args` carry the short option `letter` in any bundle, or one of the `long` spellings, before `--`. */
function hasOption(args: readonly string[], letter: string | undefined, long: readonly string[]): boolean {
  for (const arg of args) {
    if (arg === "--") return false;
    if (!arg.startsWith("-")) continue;
    if (arg.startsWith("--")) {
      if (spellsLongOption(arg, long)) return true;
    } else if (letter !== undefined && arg.includes(letter)) {
      return true;
    }
  }
  return false;
}

export function gitVerdict(argWords: readonly ShellToken[]): ClassificationVerdict {
  const options = gitOptions();
  const argTexts = argWords.map((word) => word.text);
  const scan = skipOptionsOf(options.leading, argWords, 0);
  if (!scan) return APPROVAL;
  const args = argTexts.slice(scan.index);

  if (args[0] === "reset") return args.includes("--hard") ? APPROVAL : SAFE;
  // `git clean` deletes untracked files whenever it runs for real: `-f` is only required while
  // `clean.requireForce` holds its default, and `git -c clean.requireForce=false clean` removes that guard.
  // Only a dry run is harmless.
  if (args[0] === "clean") return hasOption(args.slice(1), "n", ["--dry-run"]) ? SAFE : APPROVAL;
  if (args[0] === "push") {
    const pushArgs = args.slice(1);
    const forces =
      hasOption(pushArgs, "f", ["--force", "--force-with-lease", "--force-if-includes"]) ||
      hasOption(pushArgs, "d", ["--delete"]) ||
      // `--mirror` forces every ref and deletes those absent locally; `--prune` deletes absent remote refs.
      hasOption(pushArgs, undefined, ["--mirror", "--prune"]) ||
      pushArgs.some((arg) => !arg.startsWith("-") && options.forcingRefspec.test(arg));
    return forces ? APPROVAL : SAFE;
  }
  // `git rm` and `git restore` only ever act on working-tree files.
  if (args[0] === "rm" || args[0] === "restore") return APPROVAL;
  if (args[0] === "checkout") {
    const verdict = checkoutVerdict(argWords.slice(scan.index + 1), options);
    // The check would resolve the operand against a directory this text does not hold.
    if (verdict.kind === "host-check" && movesGitDirectory(argTexts.slice(0, scan.index))) return APPROVAL;
    return verdict;
  }
  if (args[0] === "worktree") return args[1] === "remove" ? APPROVAL : SAFE;
  return SAFE;
}

function hasRiskyPath(args: readonly string[]): boolean {
  return args.some(
    (arg) => arg.startsWith("/") || /[*?[]/.test(arg) || /(^|\/)\.env(\.|$)|(^|\/)\.(ssh|aws|kube)(\/|$)/.test(arg),
  );
}

function hasRecursiveOption(
  args: readonly string[],
  options: Extract<ClassificationOptions, { kind: "chmod" | "chown" }>,
): boolean {
  return hasOption(args, options.recursiveShort, options.recursiveLong);
}

function filteredArgs(args: readonly string[]): string[] {
  return args.filter((arg) => !arg.startsWith("-"));
}

/**
 * Whether a chmod mode grants write access. An octal mode does so for others when its last digit has the
 * write bit, whatever leading zeros precede it (`0777`, `00666`); a symbolic mode does so when any clause
 * adds or sets `w` (`+w`, `a=rwx`, `o+rw`, `u+x,o+w`).
 */
function modeGrantsWrite(mode: string): boolean {
  if (/^[0-7]+$/.test(mode)) return /[2367]$/.test(mode);
  return mode.split(",").some((clause) => /^[augo]*[+=][rwxXst]*w/.test(clause));
}

// GNU `chmod --reference=RFILE` and `chown --reference=RFILE` copy RFILE's mode or owner, which this text
// never shows, so the change is treated as destructive whatever RFILE holds.
function copiesFromReference(
  args: readonly string[],
  options: Extract<ClassificationOptions, { kind: "chmod" | "chown" }>,
): boolean {
  return hasOption(args, undefined, options.referenceLong);
}

/**
 * An `mv` with two operands renames one entry. With more, every operand but the last moves into the last,
 * which then has to be an existing directory: `mv a b c d` with `d` absent or a file fails or clobbers
 * `d`. Whether it is one only the host knows, so that becomes a host check. `-t` and `-T` change which
 * operand is the destination, and a destination the shell rewrites cannot be looked up as written.
 */
function moveVerdict(
  argTexts: readonly string[],
  operands: readonly ShellToken[],
  options: Extract<ClassificationOptions, { kind: "mv" }>,
): ClassificationVerdict {
  if (hasOption(argTexts, options.forceShort, options.forceLong) || hasRiskyPath(argTexts)) return APPROVAL;
  const operandCount = filteredArgs(argTexts).length;
  if (operandCount === 2) return SAFE;
  // An option value among the non-option words (`-S .bak`, `--suffix .bak`) keeps today's verdict: only a
  // command whose non-option words are all path operands is judged by its last one.
  if (operandCount < 2 || operands.length !== operandCount) return APPROVAL;
  if (hasOption(argTexts, "t", ["--target-directory"]) || hasOption(argTexts, "T", ["--no-target-directory"])) {
    return APPROVAL;
  }
  const destination = operands.at(-1);
  if (destination === undefined || !namesOnePathLiterally(destination)) return APPROVAL;
  return { kind: "host-check", check: { path: destination.text, expectation: "directory" } };
}

export function commandVerdict(name: string, args: readonly ShellToken[]): ClassificationVerdict {
  const rule = commandRule(name);
  const model = rule?.classification;
  const options = rule?.classificationOptions;
  if (model === "always") return APPROVAL;
  const argTexts = args.map((word) => word.text);
  let operands: ShellToken[] = [];
  if (model === "mv" || model === "chmod" || model === "chown") {
    const extracted = extractPathOperands(name, args);
    if (extracted.kind === "unprovable") return APPROVAL;
    operands = extracted.value;
  }
  if (model === "mv" && options?.kind === "mv") return moveVerdict(argTexts, operands, options);
  if (model === "chmod" && options?.kind === "chmod") {
    return hasRecursiveOption(argTexts, options) ||
      copiesFromReference(argTexts, options) ||
      modeGrantsWrite(filteredArgs(argTexts)[0] ?? "") ||
      hasRiskyPath(argTexts)
      ? APPROVAL
      : SAFE;
  }
  if (model === "chown" && options?.kind === "chown") {
    return hasRecursiveOption(argTexts, options) ||
      copiesFromReference(argTexts, options) ||
      /^(root|0)(:|$)/.test(filteredArgs(argTexts)[0] ?? "") ||
      hasRiskyPath(argTexts)
      ? APPROVAL
      : SAFE;
  }
  return SAFE;
}
