import { namesOnePathLiterally } from "../../../shell/expansion.ts";
import { hasOption, skipOptionsOf } from "../../../shell/option-scanner.ts";
import type { OptionModel } from "../../../commands/option-model.ts";
import type { ShellToken } from "../../../shell/types.ts";
import {
  APPROVAL,
  SAFE,
  hostCheck,
  type ClassificationVerdict,
  type ClassifierRegistration,
} from "../classification.ts";

// Git's own options, which stand before the subcommand.
const LEADING_OPTIONS: OptionModel = {
  value: new Set([
    "-C",
    "-c",
    "--git-dir",
    "--work-tree",
    "--namespace",
    "--super-prefix",
    "--config-env",
    "--list-cmds",
    "--attr-source",
  ]),
  flag: new Set([
    "-p",
    "--paginate",
    "-P",
    "--no-pager",
    "--bare",
    "--no-replace-objects",
    "--no-lazy-fetch",
    "--no-optional-locks",
    "--no-advice",
    "--literal-pathspecs",
    "--glob-pathspecs",
    "--noglob-pathspecs",
    "--icase-pathspecs",
    "--exec-path",
    "--html-path",
    "--man-path",
    "--info-path",
    "--version",
    "--help",
  ]),
};

const CHECKOUT_BRANCH = new Set(["-b", "--orphan", "-t", "--track", "--detach"]);
const CHECKOUT_BRANCH_VALUE = new Set(["-b", "--orphan"]);
const CHECKOUT_DESTRUCTIVE = /^(--ours|--theirs|-p|--patch|--pathspec-from-file(=.*)?|-B|--force)$/;
const FORCING_REFSPEC = /^\+|^:./;

/**
 * Whether a `git checkout` can overwrite working-tree files or move an existing branch. Creating a branch
 * with `-b`, tracking one, or detaching does neither, and Git refuses a switch that would lose local changes,
 * unless `-f` discards them. `-B` resets a branch that already exists to the start point and checks it out.
 * A lone operand is a branch to Git only when no file of that name exists in the working directory, which
 * only the host can check, so it becomes a host check for that path being absent; a second operand is always
 * a pathspec after a tree-ish.
 */
function checkoutVerdict(args: readonly ShellToken[]): ClassificationVerdict {
  const operands: ShellToken[] = [];
  let namesBranch = false;
  for (let i = 0; i < args.length; i += 1) {
    const word = args[i];
    const arg = word?.text ?? "";
    if (arg === "--" || CHECKOUT_DESTRUCTIVE.test(arg) || /^-[A-Za-z]*[fB]/.test(arg)) return APPROVAL;
    if (word && (arg === "-" || !arg.startsWith("-"))) {
      operands.push(word);
      continue;
    }
    if (CHECKOUT_BRANCH.has(arg)) namesBranch = true;
    if (CHECKOUT_BRANCH_VALUE.has(arg)) i += 1;
  }
  if (namesBranch) return SAFE;
  if (operands.length > 1) return APPROVAL;
  const operand = operands[0];
  if (operand === undefined || operand.text === "-") return SAFE;
  if (!namesOnePathLiterally(operand)) return APPROVAL;
  return hostCheck(operand.text, "absent");
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

function gitVerdict(argWords: readonly ShellToken[]): ClassificationVerdict {
  const argTexts = argWords.map((word) => word.text);
  const scan = skipOptionsOf(LEADING_OPTIONS, argWords, 0);
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
      pushArgs.some((arg) => !arg.startsWith("-") && FORCING_REFSPEC.test(arg));
    return forces ? APPROVAL : SAFE;
  }
  // `git rm` and `git restore` only ever act on working-tree files.
  if (args[0] === "rm" || args[0] === "restore") return APPROVAL;
  if (args[0] === "checkout") {
    const verdict = checkoutVerdict(argWords.slice(scan.index + 1));
    // The check would resolve the operand against a directory this text does not hold.
    if (verdict.kind === "host-check" && movesGitDirectory(argTexts.slice(0, scan.index))) return APPROVAL;
    return verdict;
  }
  if (args[0] === "worktree") return args[1] === "remove" ? APPROVAL : SAFE;
  return SAFE;
}

export const GIT_CLASSIFIERS: readonly ClassifierRegistration[] = [
  { names: ["git"], classify: ({ args }) => gitVerdict(args) },
];
