import { extractPathOperands } from "../../../proof/path-operands.ts";
import { namesOnePathLiterally } from "../../../shell/expansion.ts";
import { hasOption } from "../../../shell/option-scanner.ts";
import type { ShellToken } from "../../../shell/types.ts";
import {
  APPROVAL,
  SAFE,
  hostCheck,
  type ClassificationContext,
  type ClassificationVerdict,
  type ClassifierRegistration,
} from "../classification.ts";

const MOVE_FORCE_SHORT = "f";
const MOVE_FORCE_LONG = ["--force"];
const RECURSIVE_SHORT = "R";
const RECURSIVE_LONG = ["--recursive"];
const REFERENCE_LONG = ["--reference"];

function hasRiskyPath(args: readonly string[]): boolean {
  return args.some(
    (arg) => arg.startsWith("/") || /[*?[]/.test(arg) || /(^|\/)\.env(\.|$)|(^|\/)\.(ssh|aws|kube)(\/|$)/.test(arg),
  );
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
function copiesFromReference(args: readonly string[]): boolean {
  return hasOption(args, undefined, REFERENCE_LONG);
}

/**
 * An `mv` with two operands renames one entry. With more, every operand but the last moves into the last,
 * which then has to be an existing directory: `mv a b c d` with `d` absent or a file fails or clobbers
 * `d`. Whether it is one only the host knows, so that becomes a host check. `-t` and `-T` change which
 * operand is the destination, and a destination the shell rewrites cannot be looked up as written.
 */
function moveVerdict(argTexts: readonly string[], operands: readonly ShellToken[]): ClassificationVerdict {
  if (hasOption(argTexts, MOVE_FORCE_SHORT, MOVE_FORCE_LONG) || hasRiskyPath(argTexts)) return APPROVAL;
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
  return hostCheck(destination.text, "directory");
}

/**
 * The path operands of `mv`, `chmod`, or `chown`, or undefined when an option could have hidden one. The
 * scan is the proof's, so a command the proof cannot read is never cleared here either.
 */
function pathOperands({ name, args }: ClassificationContext): readonly ShellToken[] | undefined {
  const extracted = extractPathOperands(name, args);
  return extracted.kind === "unprovable" ? undefined : extracted.value;
}

function metadataChangeVerdict(
  context: ClassificationContext,
  changeIsRisky: (metadata: string) => boolean,
): ClassificationVerdict {
  if (!pathOperands(context)) return APPROVAL;
  const { argTexts } = context;
  const metadata = filteredArgs(argTexts)[0] ?? "";
  return hasOption(argTexts, RECURSIVE_SHORT, RECURSIVE_LONG) ||
    copiesFromReference(argTexts) ||
    changeIsRisky(metadata) ||
    hasRiskyPath(argTexts)
    ? APPROVAL
    : SAFE;
}

export const FILESYSTEM_CLASSIFIERS: readonly ClassifierRegistration[] = [
  {
    names: ["mv"],
    classify: (context) => {
      const operands = pathOperands(context);
      return operands ? moveVerdict(context.argTexts, operands) : APPROVAL;
    },
  },
  { names: ["chmod"], classify: (context) => metadataChangeVerdict(context, modeGrantsWrite) },
  { names: ["chown"], classify: (context) => metadataChangeVerdict(context, (owner) => /^(root|0)(:|$)/.test(owner)) },
];
