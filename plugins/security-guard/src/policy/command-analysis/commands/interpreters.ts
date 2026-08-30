import { expandsBeforeUse } from "../../../shell/expansion.ts";
import { skipOptionsOf } from "../../../shell/option-scanner.ts";
import type { OptionModel } from "../../../commands/option-model.ts";
import { APPROVAL, SAFE, type ClassificationContext, type ClassifierRegistration } from "../classification.ts";

function destructiveVerdict(destructive: boolean) {
  return destructive ? APPROVAL : SAFE;
}

// bash joins `eval`'s operands with a space and parses the result, so one the outer shell expands hides it.
function classifyEval({ args, argTexts, isDestructiveText }: ClassificationContext) {
  if (args.some(expandsBeforeUse)) return APPROVAL;
  return destructiveVerdict(isDestructiveText(argTexts.join(" ")));
}

/**
 * A `trap` handler runs when the shell exits or the signal arrives, which the agent's shell always does. It is
 * judged as command text by its command word, so an interpolated operand (`docker rm -f $CID`) passes and
 * a handler whose command word is itself an expansion (`"$CLEANUP"`) fails closed. An expanded option or
 * signal operand keeps failing closed: its value can change which word is the handler or hide which
 * signals arm it.
 */
function classifyTrap({ args, argTexts, isDestructiveText }: ClassificationContext) {
  const handlerIndex = argTexts.findIndex((arg) => !arg.startsWith("-"));
  if (args.some((arg, index) => index !== handlerIndex && expandsBeforeUse(arg))) return APPROVAL;
  const handler = argTexts[handlerIndex];
  return destructiveVerdict(handler !== undefined && isDestructiveText(handler));
}

const XARGS_OPTIONS: OptionModel = {
  value: new Set([
    "-a",
    "--arg-file",
    "-d",
    "--delimiter",
    "-E",
    "-I",
    "-J",
    "-L",
    "-n",
    "--max-args",
    "-P",
    "--max-procs",
    "-R",
    "-S",
    "-s",
    "--max-chars",
  ]),
  flag: new Set([
    "-0",
    "--null",
    "-o",
    "--open-tty",
    "-p",
    "--interactive",
    "-r",
    "--no-run-if-empty",
    "-t",
    "--verbose",
    "-x",
    "--exit",
  ]),
};

function classifyXargs({ args, argIndices, isDestructiveCommandAt }: ClassificationContext) {
  // An option outside the table could take the command word as its value, hiding what actually runs.
  const scan = skipOptionsOf(XARGS_OPTIONS, args, 0);
  if (!scan) return APPROVAL;
  const index = argIndices[scan.index];
  return destructiveVerdict(index !== undefined && isDestructiveCommandAt(index));
}

// The `find` primaries that run another command, and those that write a file of their own.
const FIND_COMMAND_PRIMARIES = new Set(["-exec", "-execdir", "-ok", "-okdir"]);
const FIND_WRITE_PRIMARIES = new Set(["-delete", "-fprint", "-fprint0", "-fprintf", "-fls"]);

function classifyFind({ args, argIndices, isDestructiveCommandAt }: ClassificationContext) {
  return destructiveVerdict(
    args.some(
      (word, offset) =>
        FIND_WRITE_PRIMARIES.has(word.text) ||
        (FIND_COMMAND_PRIMARIES.has(word.text) && isDestructiveCommandAt((argIndices[offset] ?? -2) + 1)),
    ),
  );
}

export const INTERPRETER_CLASSIFIERS: readonly ClassifierRegistration[] = [
  { names: ["eval"], classify: classifyEval },
  { names: ["trap"], classify: classifyTrap },
  { names: ["xargs"], classify: classifyXargs },
  { names: ["find"], classify: classifyFind },
];
