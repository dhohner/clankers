import { commandRule, type ClassificationOptions } from "../command-registry.ts";
import { commandNeedsApproval, gitIsDestructive } from "./filesystem-and-git.ts";
import { REWRITES_COMMAND_WORD, expandsBeforeUse, nestedShellIsDestructive } from "./nested-shell.ts";
import { XARGS_OPTIONS, simpleCommandExtents, simpleCommandAt } from "../../../shell/command-parser.ts";
import { skipOptionsOf } from "../../../shell/option-scanner.ts";
import { LITERAL, shellTokens } from "../../../shell/tokenizer.ts";
import type { ShellAst } from "../../../shell/ast.ts";
import type { SimpleCommand } from "../../../shell/command-parser.ts";
import type { ShellToken, Word } from "../../../shell/types.ts";

type FindClassificationOptions = Extract<ClassificationOptions, { kind: "find" }>;

function findOptions(): FindClassificationOptions {
  const options = commandRule("find")?.classificationOptions;
  if (!options || options.kind !== "find") throw new Error("The find command rule must declare classification options");
  return options;
}

export function simpleCommandIsDestructive(
  tokens: readonly ShellToken[],
  start: number,
  failClosed = true,
  resolvedCommand?: SimpleCommand,
): boolean {
  const command = resolvedCommand ?? simpleCommandAt(tokens, start);

  // An unrecognized wrapper option hides which command runs, so assume the one needing approval.
  if (command.kind === "unresolved") return failClosed;
  const { name, args, argTexts, argIndices, commandWords } = command;
  // So does a command word the shell rewrites: `c='rm -rf /'; $c` runs a command this text never names.
  if (commandWords.some((word) => REWRITES_COMMAND_WORD.test(word.text))) return failClosed;
  const classification = commandRule(name)?.classification;
  if (commandNeedsApproval(name, argTexts)) return true;
  if (classification === "git") return gitIsDestructive(argTexts);
  if (classification === "nested-shell") return nestedShellIsDestructive(name, args, argTexts, isDestructiveText);
  if (classification === "eval") {
    // bash joins the operands with a space and parses the result, so one the outer shell expands hides it.
    if (args.some(expandsBeforeUse)) return true;
    return isDestructiveText(argTexts.join(" "));
  }
  if (classification === "trap") {
    // The handler runs when the shell exits or the signal arrives, which the agent's shell always does.
    if (args.some(expandsBeforeUse)) return true;
    const handler = argTexts.find((arg) => !arg.startsWith("-"));
    return handler !== undefined && isDestructiveText(handler);
  }
  if (classification === "xargs") {
    // An option outside the table could take the command word as its value, hiding what actually runs.
    const scan = skipOptionsOf(XARGS_OPTIONS, args, 0);
    if (!scan) return true;
    const index = argIndices[scan.index];
    return index !== undefined && simpleCommandIsDestructive(tokens, index, failClosed);
  }
  if (classification === "find") {
    const options = findOptions();
    return args.some(
      (word, offset) =>
        options.writePrimaries.has(word.text) ||
        (options.commandPrimaries.has(word.text) &&
          simpleCommandIsDestructive(tokens, (argIndices[offset] ?? -2) + 1, failClosed)),
    );
  }

  return false;
}

function substitutionContents(word: Word): string[] {
  const contents: string[] = [];
  for (const match of word.text.matchAll(/\$\(([\s\S]*?)\)(?![^(]*\))|`([^`]*)`/g)) {
    if (word.quoting[match.index] !== LITERAL) contents.push(match[1] ?? match[2] ?? "");
  }
  return contents;
}

function containsDestructiveText(value: string, failClosed: boolean): boolean {
  if (!value) return false;
  const tokens = shellTokens(value);
  // Each extent is resolved through its own redirections and wrappers, so a leading `>file` cannot hide the
  // command word behind it.
  if (simpleCommandExtents(tokens).some((extent) => simpleCommandIsDestructive(tokens, extent.start, failClosed))) {
    return true;
  }
  return tokens.some((token) => {
    if (token.heredoc && containsDestructiveText(token.text, false)) return true;
    return (!token.sep || token.heredoc) && substitutionContents(token).some(isDestructiveText);
  });
}

export type ShellDestructiveClassification = {
  destructive: boolean;
  destructiveStarts: ReadonlySet<number>;
};

/** Classifies the commands retained in one AST without tokenizing or resolving them again. */
export function classifyShellAst(ast: ShellAst): ShellDestructiveClassification {
  const destructiveStarts = new Set<number>();
  for (const command of ast.commands) {
    if (simpleCommandIsDestructive(ast.tokens, command.extent.start, true, command.resolved)) {
      destructiveStarts.add(command.extent.start);
    }
  }

  const nestedDestructive = ast.tokens.some((token) => {
    if (token.heredoc && containsDestructiveText(token.text, false)) return true;
    return (!token.sep || token.heredoc) && substitutionContents(token).some(isDestructiveText);
  });
  return { destructive: destructiveStarts.size > 0 || nestedDestructive, destructiveStarts };
}

export function isDestructiveText(value: string): boolean {
  return containsDestructiveText(value, true);
}
