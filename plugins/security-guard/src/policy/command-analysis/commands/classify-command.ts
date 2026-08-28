import { commandRule, type ClassificationOptions, type CommandClassificationModel } from "../command-registry.ts";
import { commandVerdict, gitVerdict, type ClassificationVerdict } from "./filesystem-and-git.ts";
import { NESTED_SHELLS, expandsBeforeUse, nestedShellIsDestructive, rewritesCommandWord } from "./nested-shell.ts";
import {
  XARGS_OPTIONS,
  assignedName,
  escalatesPrivilege,
  isTrustedCommandWord,
  pathResolvedCommandNames,
  simpleCommandExtents,
  simpleCommandAt,
} from "../../../shell/command-parser.ts";
import { skipOptionsOf } from "../../../shell/option-scanner.ts";
import { LITERAL, UNQUOTED, substitutionEnd, tokenizeShell } from "../../../shell/tokenizer.ts";
import type { ShellAst } from "../../../shell/ast.ts";
import type { SimpleCommand } from "../../../shell/command-parser.ts";
import type { ShellToken, Word } from "../../../shell/types.ts";
import type { HostPathCheck } from "../result.ts";

type FindClassificationOptions = Extract<ClassificationOptions, { kind: "find" }>;

function findOptions(): FindClassificationOptions {
  const options = commandRule("find")?.classificationOptions;
  if (!options || options.kind !== "find") throw new Error("The find command rule must declare classification options");
  return options;
}

/**
 * One simple command's verdict. A destructive one may carry a host check: the command is harmless if the
 * host confirms the check, and needs approval otherwise. Only a top-level command keeps the check; a command
 * a nested shell, `xargs`, `find`, or `eval` runs reads it as destructive outright.
 */
export type CommandVerdict = { destructive: false } | { destructive: true; hostCheck?: HostPathCheck };

const NOT_DESTRUCTIVE: CommandVerdict = { destructive: false };
const DESTRUCTIVE: CommandVerdict = { destructive: true };

function toCommandVerdict(verdict: ClassificationVerdict): CommandVerdict {
  if (verdict.kind === "safe") return NOT_DESTRUCTIVE;
  if (verdict.kind === "approval") return DESTRUCTIVE;
  return { destructive: true, hostCheck: verdict.check };
}

export function simpleCommandIsDestructive(
  tokens: readonly ShellToken[],
  start: number,
  failClosed = true,
  resolvedCommand?: SimpleCommand,
): boolean {
  return simpleCommandVerdict(tokens, start, failClosed, resolvedCommand).destructive;
}

export function simpleCommandVerdict(
  tokens: readonly ShellToken[],
  start: number,
  failClosed = true,
  resolvedCommand?: SimpleCommand,
): CommandVerdict {
  const command = resolvedCommand ?? simpleCommandAt(tokens, start);

  // An unrecognized wrapper option hides which command runs, so assume the one needing approval.
  if (command.kind === "unresolved") return failClosed ? DESTRUCTIVE : NOT_DESTRUCTIVE;
  const { name, args, argTexts, argIndices, commandWords } = command;
  // So does a command word the shell rewrites: `c='rm -rf /'; $c` runs a command this text never names.
  if (commandWords.some(rewritesCommandWord)) return failClosed ? DESTRUCTIVE : NOT_DESTRUCTIVE;
  const classification = commandRule(name)?.classification;
  const verdict = commandVerdict(name, args);
  if (verdict.kind !== "safe") return toCommandVerdict(verdict);
  if (classification === "git") return toCommandVerdict(gitVerdict(args));
  return destructiveByClassification(classification, tokens, name, args, argTexts, argIndices, failClosed)
    ? DESTRUCTIVE
    : NOT_DESTRUCTIVE;
}

function destructiveByClassification(
  classification: CommandClassificationModel | undefined,
  tokens: readonly ShellToken[],
  name: string,
  args: ShellToken[],
  argTexts: string[],
  argIndices: number[],
  failClosed: boolean,
): boolean {
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

const MAX_ARITHMETIC_NESTING = 64;

type SubstitutionScan = { contents: string[]; nestingLimitExceeded: boolean };

/**
 * Finds command lists iteratively so adversarial arithmetic nesting cannot exhaust the JavaScript call stack.
 * The limit also bounds repeated delimiter scans; exceeding it makes classification fail closed.
 */
function scanSubstitutions(word: Word): SubstitutionScan {
  const contents: string[] = [];
  const arithmeticEnds: number[] = [];
  const { text, quoting } = word;
  for (let i = 0; i < text.length; i += 1) {
    while (arithmeticEnds.length > 0 && i >= (arithmeticEnds.at(-1) ?? 0)) arithmeticEnds.pop();

    const char = text[i];
    if (quoting[i] === LITERAL) continue;
    if (char === "`") {
      const end = text.indexOf("`", i + 1);
      const stop = end < 0 ? text.length : end;
      contents.push(text.slice(i + 1, stop));
      i = stop;
      continue;
    }
    if (text[i + 1] !== "(") continue;
    const command = char === "$";
    const process = (char === "<" || char === ">") && quoting[i] === UNQUOTED;
    if (!command && !process) continue;
    const end = substitutionEnd(text, i);
    if (command && text[i + 2] === "(" && text[end - 1] === ")") {
      arithmeticEnds.push(end);
      if (arithmeticEnds.length > MAX_ARITHMETIC_NESTING) {
        return { contents, nestingLimitExceeded: true };
      }
      i += 2;
      continue;
    }
    contents.push(text.slice(i + 2, end));
    i = end;
  }
  return { contents, nestingLimitExceeded: false };
}

/**
 * The text of every command list the shell runs while expanding `word`: `$( ... )`, backticks, and the
 * process substitutions `<( ... )` and `>( ... )`. A quoted one is literal and skipped. An arithmetic expansion
 * `$(( ... ))` runs no command of its own, so only the substitutions inside it are listed.
 */
export function substitutionContents(word: Word): string[] {
  return scanSubstitutions(word).contents;
}

// Number forms bash arithmetic accepts that contain letters: hexadecimal and `base#digits`.
const ARITHMETIC_NUMBER = /0[xX][0-9a-fA-F]+|[0-9]+#[0-9a-zA-Z@_]+/g;
// The `[[ ... ]]` operators whose operands bash evaluates as arithmetic expressions.
const ARITHMETIC_TEST_OPERATORS = new Set(["-eq", "-ne", "-lt", "-le", "-gt", "-ge"]);
const INTEGER = /^[+-]?[0-9]+$/;

/**
 * Whether bash can read a value this text does not show while evaluating `expression`. Arithmetic evaluates
 * a named variable's value as an expression of its own, recursively, and expands the subscript of an array
 * reference on the way, so `x='a[$(rm -rf build)]'; echo $((x))` runs `rm` although this text never names
 * it. A nested arithmetic expansion is checked the same way, and a command substitution or backtick inside
 * arithmetic supplies source that bash evaluates again, so it fails closed whatever it runs.
 */
function arithmeticReadsVariable(expression: string): boolean {
  let stripped = "";
  const arithmeticEnds: number[] = [];
  for (let i = 0; i < expression.length; i += 1) {
    while (arithmeticEnds.length > 0 && i >= (arithmeticEnds.at(-1) ?? 0)) arithmeticEnds.pop();

    const char = expression[i] ?? "";
    if (char === "`") return true;
    if (char === "$" && expression[i + 1] === "(") {
      const end = substitutionEnd(expression, i);
      if (expression[i + 2] !== "(" || expression[end - 1] !== ")") return true;
      arithmeticEnds.push(end);
      if (arithmeticEnds.length > MAX_ARITHMETIC_NESTING) return true;
      i += 2;
      continue;
    }
    stripped += char;
  }
  return /[A-Za-z_$]/.test(stripped.replace(ARITHMETIC_NUMBER, ""));
}

/**
 * Whether the shell evaluates, while expanding `word`, an arithmetic expression whose value this text does not
 * show: an arithmetic expansion that names a variable, or a `[[ ... ]]` arithmetic comparison whose operand is
 * not an integer literal. Either reads a value that may carry a substitution of its own.
 */
function evaluatesUnreadableArithmetic(word: ShellToken): boolean {
  const { text, quoting } = word;
  for (let i = 0; i < text.length; i += 1) {
    if (quoting[i] === LITERAL) continue;
    if (text.startsWith("$((", i)) {
      const end = substitutionEnd(text, i);
      if (text[end - 1] !== ")") continue;
      if (arithmeticReadsVariable(text.slice(i + 3, end - 1))) return true;
      i = end;
      continue;
    }
  }
  if (!word.testExpression) return false;
  // Quotes are gone from the text, so a quoted operand holding a space splits here; every piece that is not an
  // integer fails closed, which is the safe direction.
  const operands = text.slice(2, -2).split(/\s+/);
  return operands.some(
    (operand, index) =>
      ARITHMETIC_TEST_OPERATORS.has(operand) &&
      !(INTEGER.test(operands[index - 1] ?? "") && INTEGER.test(operands[index + 1] ?? "")),
  );
}

function containsDestructiveText(value: string, failClosed: boolean): boolean {
  if (!value) return false;
  const tokenization = tokenizeShell(value);
  if (tokenization.kind === "unsupported") return failClosed;
  const { tokens } = tokenization;
  // Each extent is resolved through its own redirections and wrappers, so a leading `>file` cannot hide the
  // command word behind it.
  if (simpleCommandExtents(tokens).some((extent) => simpleCommandIsDestructive(tokens, extent.start, failClosed))) {
    return true;
  }
  return tokens.some((token) => nestedTextIsDestructive(tokens, token));
}

/**
 * Whether the program reading a here-document body parses it as shell commands. Only a shell does; every
 * other reader takes the body as data, so its words are never command names. An owner that cannot be
 * resolved, through an unknown wrapper option or a command word the shell rewrites, is read as a shell.
 */
function heredocReaderIsShell(tokens: readonly ShellToken[], body: ShellToken): boolean {
  if (body.heredocOwner === undefined) return true;
  const owner = simpleCommandAt(tokens, body.heredocOwner);
  if (owner.kind === "unresolved") return true;
  if (owner.commandWords.some(rewritesCommandWord)) return true;
  return NESTED_SHELLS.has(owner.name);
}

/**
 * Whether text the current shell runs apart from the command words is destructive: a substitution in any
 * word, an unquoted here-document body's substitutions, and a here-document body a shell reads as commands.
 */
function nestedTextIsDestructive(tokens: readonly ShellToken[], token: ShellToken): boolean {
  if (token.heredoc && heredocReaderIsShell(tokens, token) && isDestructiveText(token.text)) return true;
  if (token.sep && !token.heredoc) return false;

  const substitutions = scanSubstitutions(token);
  return (
    substitutions.nestingLimitExceeded ||
    substitutions.contents.some(isDestructiveText) ||
    evaluatesUnreadableArithmetic(token)
  );
}

export type ShellDestructiveClassification = {
  destructive: boolean;
  destructiveStarts: ReadonlySet<number>;
  /**
   * The host check that would clear the one command in the text, with the bare command words the host must
   * resolve to system executables first, or undefined when the text holds anything else: a second command,
   * a redirection, or an assignment could create or move the checked path between the inspection and the
   * command.
   */
  hostCheck: { checks: HostPathCheck[]; commands: string[] } | undefined;
};

// Assignment prefixes that change where Git looks or what runs: `GIT_*` moves the repository, working tree,
// or executable directory, `HOME` and `XDG_CONFIG_HOME` select a configuration that may set `core.worktree`,
// `PATH` selects the binary, and the loader variables inject code into it.
const GIT_CONTEXT_ASSIGNMENT = /^(GIT_|DYLD_|LD_)|^(PATH|HOME|XDG_CONFIG_HOME)$/;

/**
 * Whether the host's answer about a path still holds when the command runs. Only a lone simple command
 * whose words the shell passes through unchanged qualifies. An earlier command in a list (`printf x > main;
 * git checkout main`), a redirection, and any expansion in any word (`X=$(touch main) git checkout main`,
 * `git checkout -q$(touch main) main`) run first and can create the very path that was found absent. A
 * literal assignment prefix is inert unless it changes Git's context, and a wrapper that moves the working
 * directory makes the answer meaningless. The command words obey the proof's rules too: an executable
 * outside the system directories or a privilege escalation runs something other than the tool judged here.
 */
function hostCheckHolds(ast: ShellAst): boolean {
  if (ast.commands.length !== 1) return false;
  const resolved = ast.commands[0]?.resolved;
  if (!resolved || resolved.kind !== "resolved" || resolved.statefulWrapper) return false;
  if (resolved.redirections.length > 0) return false;
  if (!resolved.commandWords.every(isTrustedCommandWord) || escalatesPrivilege(resolved.commandWords)) return false;
  return !ast.tokens.some(
    (token) =>
      token.redirect ||
      token.heredoc ||
      expandsBeforeUse(token) ||
      GIT_CONTEXT_ASSIGNMENT.test(assignedName(token) ?? ""),
  );
}

/** Classifies the commands retained in one AST without tokenizing or resolving them again. */
export function classifyShellAst(ast: ShellAst): ShellDestructiveClassification {
  const destructiveStarts = new Set<number>();
  let hostCheck: HostPathCheck | undefined;
  for (const command of ast.commands) {
    const verdict = simpleCommandVerdict(ast.tokens, command.extent.start, true, command.resolved);
    if (!verdict.destructive) continue;
    destructiveStarts.add(command.extent.start);
    hostCheck = verdict.hostCheck;
  }

  const nestedDestructive = ast.tokens.some((token) => nestedTextIsDestructive(ast.tokens, token));
  const command = ast.commands[0]?.resolved;
  const hostCheckResult =
    hostCheck && command?.kind === "resolved" && !nestedDestructive && hostCheckHolds(ast)
      ? { checks: [hostCheck], commands: pathResolvedCommandNames(command.commandWords) }
      : undefined;
  return {
    destructive: destructiveStarts.size > 0 || nestedDestructive,
    destructiveStarts,
    hostCheck: hostCheckResult,
  };
}

export function isDestructiveText(value: string): boolean {
  return containsDestructiveText(value, true);
}
