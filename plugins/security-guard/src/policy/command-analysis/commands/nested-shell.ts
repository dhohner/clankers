import { NESTED_SHELL_NAMES } from "../../../commands/registry.ts";
import { expandsBeforeUse, rewritesCommandWord } from "../../../shell/expansion.ts";
import type { ShellToken } from "../../../shell/types.ts";
import { APPROVAL, SAFE, type ClassificationContext, type ClassifierRegistration } from "../classification.ts";

const FLAG_LETTERS = "abefhiklmnprstuvxBCDEHPT";
const FLAGS = new Set([
  "--debugger",
  "--dump-po-strings",
  "--dump-strings",
  "--help",
  "--login",
  "--noediting",
  "--noprofile",
  "--norc",
  "--posix",
  "--pretty-print",
  "--restricted",
  "--verbose",
  "--version",
]);
const VALUE_OPTIONS = new Set(["--rcfile", "--init-file"]);

/**
 * Whether a nested shell invocation can run a destructive command. Options are scanned the way the shell
 * scans them, because it keeps reading them after `-c`: in `bash -co pipefail SCRIPT` and `bash -c -- SCRIPT`
 * the script is not the word after `-c`. An option this table does not cover leaves the script unfindable and
 * fails the call closed.
 */
function nestedShellIsDestructive(
  args: readonly ShellToken[],
  argTexts: readonly string[],
  isDestructiveText: (value: string) => boolean,
): boolean {
  let commandMode = false;
  let index = 0;

  for (; index < argTexts.length; index += 1) {
    const arg = argTexts[index] ?? "";
    if (arg === "--") {
      index += 1;
      break;
    }
    if (arg === "-" || !(arg.startsWith("-") || arg.startsWith("+"))) {
      // The word ending the options is the script. Before `-c` names one, a word that rewrites could become
      // options of its own, `-c` among them.
      if (!commandMode && args[index] && rewritesCommandWord(args[index])) return true;
      break;
    }
    // An option word that rewrites could carry a `-c` whose text would run instead.
    if (args[index] && rewritesCommandWord(args[index])) return true;

    if (arg.startsWith("--")) {
      const inline = arg.indexOf("=");
      const base = inline < 0 ? arg : arg.slice(0, inline);
      if (VALUE_OPTIONS.has(base)) {
        if (inline < 0) index += 1;
        continue;
      }
      if (!FLAGS.has(base)) return true;
      continue;
    }

    for (const letter of arg.slice(1)) {
      if (letter === "c" && arg.startsWith("-")) {
        commandMode = true;
        continue;
      }
      if (!FLAG_LETTERS.includes(letter)) return true;
    }
  }

  const script = args[index];
  // Without `-c` the shell runs a script file this policy cannot read, or, with no operand at all, whatever
  // arrives on standard input: a heredoc, a here-string, or the left side of a pipe.
  if (!commandMode) return script === undefined || script.text === "-";
  if (!script) return false;
  // The operands after the script become `$0` and the positional parameters, which cannot change what runs.
  if (expandsBeforeUse(script)) return true;
  return isDestructiveText(script.text);
}

function classifyNestedShell({ args, argTexts, isDestructiveText }: ClassificationContext) {
  return nestedShellIsDestructive(args, argTexts, isDestructiveText) ? APPROVAL : SAFE;
}

export const NESTED_SHELL_CLASSIFIERS: readonly ClassifierRegistration[] = [
  { names: NESTED_SHELL_NAMES, classify: classifyNestedShell },
];

/** The command names that read their operand or standard input as shell commands. */
export const NESTED_SHELLS: ReadonlySet<string> = new Set(NESTED_SHELL_NAMES);
