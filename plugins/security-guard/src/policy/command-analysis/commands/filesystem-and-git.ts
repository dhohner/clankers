import { commandRule, type ClassificationOptions } from "../command-registry.ts";
import { extractPathOperands } from "../../../proof/path-operands.ts";
import { skipOptionsOf, spellsLongOption } from "../../../shell/option-scanner.ts";

type GitClassificationOptions = Extract<ClassificationOptions, { kind: "git" }>;

function gitOptions(): GitClassificationOptions {
  const options = commandRule("git")?.classificationOptions;
  if (!options || options.kind !== "git") throw new Error("The git command rule must declare classification options");
  return options;
}

/**
 * Whether a `git checkout` can overwrite working-tree files or move an existing branch. Creating a branch
 * with `-b`, tracking one, or detaching does neither, and Git refuses a switch that would lose local changes,
 * unless `-f` discards them. `-B` resets a branch that already exists to the start point and checks it out.
 * A lone operand is a branch to Git only when no file of that name exists, which cannot be known here, so a
 * lone operand other than `-` counts as a path; a second operand is always a pathspec after a tree-ish.
 */
function checkoutIsDestructive(args: readonly string[], options: GitClassificationOptions): boolean {
  const operands: string[] = [];
  let namesBranch = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    if (arg === "--" || options.checkoutDestructive.test(arg) || /^-[A-Za-z]*[fB]/.test(arg)) return true;
    if (arg === "-" || !arg.startsWith("-")) {
      operands.push(arg);
      continue;
    }
    if (options.checkoutBranch.has(arg)) namesBranch = true;
    if (options.checkoutBranchValue.has(arg)) i += 1;
  }
  if (namesBranch) return false;
  if (operands.length > 1) return true;
  const operand = operands[0];
  return operand !== undefined && operand !== "-";
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

export function gitIsDestructive(argTexts: readonly string[]): boolean {
  const options = gitOptions();
  const words = argTexts.map((text) => ({ text, quoting: "" }));
  const scan = skipOptionsOf(options.leading, words, 0);
  if (!scan) return true;
  const args = argTexts.slice(scan.index);

  if (args[0] === "reset") return args.includes("--hard");
  // `git clean` deletes untracked files whenever it runs for real: `-f` is only required while
  // `clean.requireForce` holds its default, and `git -c clean.requireForce=false clean` removes that guard.
  // Only a dry run is harmless.
  if (args[0] === "clean") return !hasOption(args.slice(1), "n", ["--dry-run"]);
  if (args[0] === "push") {
    const pushArgs = args.slice(1);
    return (
      hasOption(pushArgs, "f", ["--force", "--force-with-lease", "--force-if-includes"]) ||
      hasOption(pushArgs, "d", ["--delete"]) ||
      // `--mirror` forces every ref and deletes those absent locally; `--prune` deletes absent remote refs.
      hasOption(pushArgs, undefined, ["--mirror", "--prune"]) ||
      pushArgs.some((arg) => !arg.startsWith("-") && options.forcingRefspec.test(arg))
    );
  }
  // `git rm` and `git restore` only ever act on working-tree files.
  if (args[0] === "rm" || args[0] === "restore") return true;
  if (args[0] === "checkout") return checkoutIsDestructive(args.slice(1), options);
  if (args[0] === "worktree") return args[1] === "remove";
  return false;
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

export function commandNeedsApproval(name: string, args: readonly string[]): boolean {
  const rule = commandRule(name);
  const model = rule?.classification;
  const options = rule?.classificationOptions;
  if (model === "always") return true;
  if (model === "mv" || model === "chmod" || model === "chown") {
    const words = args.map((text) => ({ text, quoting: "", sep: false, redirect: false }));
    if (extractPathOperands(name, words).kind === "unprovable") return true;
  }
  if (model === "mv" && options?.kind === "mv") {
    return (
      hasOption(args, options.forceShort, options.forceLong) || filteredArgs(args).length !== 2 || hasRiskyPath(args)
    );
  }
  if (model === "chmod" && options?.kind === "chmod") {
    return (
      hasRecursiveOption(args, options) ||
      copiesFromReference(args, options) ||
      modeGrantsWrite(filteredArgs(args)[0] ?? "") ||
      hasRiskyPath(args)
    );
  }
  if (model === "chown" && options?.kind === "chown") {
    return (
      hasRecursiveOption(args, options) ||
      copiesFromReference(args, options) ||
      /^(root|0)(:|$)/.test(filteredArgs(args)[0] ?? "") ||
      hasRiskyPath(args)
    );
  }
  return false;
}
