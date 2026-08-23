import {
  commandRule,
  COMMAND_RULES,
  type ClassificationOptions,
} from "../command-registry.ts";
import { LITERAL } from "../../../shell/tokenizer.ts";
import type { ShellToken, Word } from "../../../shell/types.ts";

type DestructiveTextPredicate = (value: string) => boolean;

/**
 * Reports whether the shell reading this word expands part of it away. A `$` or backtick inside single
 * quotes, or escaped, survives as itself; anywhere else it is replaced before the text is used, so text that
 * a nested shell or `eval` parses afterwards is not the text written here.
 */
export function expandsBeforeUse(word: Word): boolean {
  for (let i = 0; i < word.text.length; i += 1) {
    const char = word.text[i] ?? "";
    if ((char === "$" || char === "`") && word.quoting[i] !== LITERAL) return true;
  }
  return false;
}

// A word the shell rewrites before it resolves a command name: parameter expansion, command substitution, or
// brace expansion. What runs cannot be read from the text as written.
export const REWRITES_COMMAND_WORD = /[$`{}]/;

// Shells that take a command list on `-c` or read one from a script operand or standard input.
export const NESTED_SHELLS = new Set(
  COMMAND_RULES.filter((rule) => rule.classification === "nested-shell").flatMap((rule) => rule.names),
);

type NestedShellOptions = Extract<ClassificationOptions, { kind: "nested-shell" }>;

function nestedShellOptions(name: string): NestedShellOptions {
  const options = commandRule(name)?.classificationOptions;
  if (!options || options.kind !== "nested-shell") {
    throw new Error(`The ${name} command rule must declare nested-shell options`);
  }
  return options;
}

/**
 * Whether a nested shell invocation can run a destructive command. Options are scanned the way the shell
 * scans them, because it keeps reading them after `-c`: in `bash -co pipefail SCRIPT` and `bash -c -- SCRIPT`
 * the script is not the word after `-c`. An option this table does not cover leaves the script unfindable and
 * fails the call closed.
 */
export function nestedShellIsDestructive(
  name: string,
  args: readonly ShellToken[],
  argTexts: readonly string[],
  isDestructiveText: DestructiveTextPredicate,
): boolean {
  const options = nestedShellOptions(name);
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
      if (!commandMode && REWRITES_COMMAND_WORD.test(arg)) return true;
      break;
    }
    // An option word that rewrites could carry a `-c` whose text would run instead.
    if (REWRITES_COMMAND_WORD.test(arg)) return true;

    if (arg.startsWith("--")) {
      const inline = arg.indexOf("=");
      const base = inline < 0 ? arg : arg.slice(0, inline);
      if (options.valueOptions.has(base)) {
        if (inline < 0) index += 1;
        continue;
      }
      if (!options.flags.has(base)) return true;
      continue;
    }

    for (const letter of arg.slice(1)) {
      if (letter === "c" && arg.startsWith("-")) {
        commandMode = true;
        continue;
      }
      if (!options.flagLetters.includes(letter)) return true;
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

