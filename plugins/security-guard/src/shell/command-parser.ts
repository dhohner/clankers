import { commandRule, COMMAND_RULES } from "../policy/command-analysis/command-registry.ts";
import { skipOptionsOf, type OptionModel, type OptionScan } from "./option-scanner.ts";
import { SEQUENTIAL_CONTROLS, isUnquoted } from "./tokenizer.ts";
import type { ShellToken, Word } from "./types.ts";

// Lower-cased because a case-insensitive filesystem, the default on macOS, runs `/bin/RM` as `rm`.
export function commandName(token: string): string {
  return (token.split("/").at(-1) ?? token).toLowerCase();
}

/**
 * The directories whose executables the operand rules below describe; anything else could be a look-alike
 * that ignores those semantics. A command word with a slash names its executable directly. One without a
 * slash resolves through PATH, which no command in the call may reassign but which the host inherits, so the
 * caller resolves it against that PATH with `resolvesToSystemExecutable` before trusting it.
 */
export const SYSTEM_EXECUTABLE_DIRECTORIES: ReadonlySet<string> = new Set(["/bin", "/sbin", "/usr/bin", "/usr/sbin"]);

// Bash runs these itself whatever PATH holds, so no executable lookup can replace them. `time` is a reserved
// word that times the pipeline after it; bash never looks it up as a command.
export const SHELL_BUILTINS: ReadonlySet<string> = new Set(
  COMMAND_RULES.filter((rule) => rule.shellBuiltin).flatMap((rule) => rule.names),
);

export function escalatesPrivilege(commandWords: readonly Word[]): boolean {
  return commandWords.some((word) => commandRule(commandName(word.text))?.escalatesPrivilege === true);
}

export function isTrustedCommandWord(word: Word): boolean {
  const slash = word.text.lastIndexOf("/");
  return slash < 0 || SYSTEM_EXECUTABLE_DIRECTORIES.has(word.text.slice(0, slash));
}

// Reserved words are not commands: the command they introduce is the next word. Resolving from the reserved
// word instead reads `then rm -rf build` as a command called `then`, which needs no approval.
const RESERVED_WORDS = new Set([
  "!",
  "[[",
  "]]",
  "case",
  "coproc",
  "do",
  "done",
  "elif",
  "else",
  "esac",
  "fi",
  "for",
  "function",
  "if",
  "in",
  "select",
  "then",
  "until",
  "while",
]);

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

// A quoted name is not an assignment to bash: `"d"=/` runs a command called `d=/`.
export function isAssignment(word: Word | undefined): boolean {
  if (!word) return false;
  const match = ASSIGNMENT.exec(word.text);
  return match !== null && isUnquoted(word, match[0].length);
}

export function assignedName(word: Word): string | undefined {
  return isAssignment(word) ? word.text.slice(0, word.text.indexOf("=")) : undefined;
}

const xargsOptions = commandRule("xargs")?.operandCommandOptions;
if (!xargsOptions) throw new Error("The xargs command rule must declare operand command options");
export const XARGS_OPTIONS: OptionModel = xargsOptions;

function skipWrapperOptions(name: string, words: readonly Word[], start: number): OptionScan | undefined {
  const model = commandRule(name)?.wrapper;
  return model ? skipOptionsOf(model, words, start) : undefined;
}

export type Redirection = { operator: string; target: ShellToken | undefined };

/** One simple command: its words with every redirection lifted out, plus the token index of each word. */
export type ParsedCommand = { words: ShellToken[]; indices: number[]; redirections: Redirection[] };

type CommandResolutionBase = {
  redirections: Redirection[];
  /** Every word read as a command name, wrappers included, so callers can check what actually runs. */
  commandWords: ShellToken[];
};

export type SimpleCommand =
  | (CommandResolutionBase & {
      kind: "resolved";
      name: string;
      args: ShellToken[];
      argTexts: string[];
      argIndices: number[];
      /** True when a wrapper moves the working directory or root, or writes a file none of the operands names. */
      statefulWrapper: boolean;
    })
  | (CommandResolutionBase & {
      kind: "unresolved";
      reason: "unknown-wrapper-option";
    });

/** Reads the simple command starting at `start` up to the next control operator. */
export function parseCommand(tokens: readonly ShellToken[], start: number): ParsedCommand {
  const words: ShellToken[] = [];
  const indices: number[] = [];
  const redirections: Redirection[] = [];

  for (let i = start; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token) break;
    if (token.redirect) {
      const target = tokens[i + 1];
      redirections.push({ operator: token.text, target: target && !target.sep ? target : undefined });
      i += 1;
      continue;
    }
    if (token.sep) break;
    words.push(token);
    indices.push(i);
  }

  return { words, indices, redirections };
}

// Resolves leading assignments and wrappers (`env`, `sudo`, ...) to the command they actually run.
export function resolveCommand(parsed: ParsedCommand): SimpleCommand {
  const { words, indices, redirections } = parsed;
  const commandWords: ShellToken[] = [];
  let statefulWrapper = false;
  let i = 0;
  while (RESERVED_WORDS.has(words[i]?.text ?? "")) i += 1;
  while (isAssignment(words[i])) i += 1;

  while (i < words.length) {
    const word = words[i];
    const name = commandName(word?.text ?? "");
    // `env` and `sudo` both take `NAME=value` words before the command they run.
    const wrapsEnvironment = name === "env" || name === "sudo";
    if (!commandRule(name)?.wrapper) break;

    if (word) commandWords.push(word);
    const next = skipWrapperOptions(name, words, i + 1);
    if (next === undefined) {
      return { kind: "unresolved", reason: "unknown-wrapper-option", commandWords, redirections };
    }
    // `command -v rm` reports where `rm` resolves and runs nothing, so `command` itself is the command that
    // runs and the words after it are its operands; the word is pushed again as the command word below.
    if (next.inspects) {
      commandWords.pop();
      break;
    }
    statefulWrapper ||= next.stateful;
    i = next.index;
    if (wrapsEnvironment) while (isAssignment(words[i])) i += 1;
  }

  const commandWord = words[i];
  if (commandWord) commandWords.push(commandWord);
  const args = words.slice(i + 1);
  return {
    kind: "resolved",
    name: commandName(commandWord?.text ?? ""),
    args,
    argTexts: args.map((word) => word.text),
    argIndices: indices.slice(i + 1),
    redirections,
    commandWords,
    statefulWrapper,
  };
}

export function simpleCommandAt(tokens: readonly ShellToken[], start: number): SimpleCommand {
  return resolveCommand(parseCommand(tokens, start));
}

export type CommandExtent = { start: number; unconditional: boolean };

export function simpleCommandExtents(tokens: readonly ShellToken[]): CommandExtent[] {
  const extents: CommandExtent[] = [];
  let start = 0;
  let depth = 0;
  let preceding: string | undefined;

  for (let i = 0; i <= tokens.length; i += 1) {
    const token = tokens[i];
    if (token && (!token.sep || token.redirect)) continue;

    const control = token?.text;
    if (i > start) {
      extents.push({
        start,
        unconditional:
          depth === 0 &&
          (preceding === undefined || SEQUENTIAL_CONTROLS.has(preceding)) &&
          (control === undefined || SEQUENTIAL_CONTROLS.has(control)),
      });
    }
    if (control === "(" || control === "{") depth += 1;
    else if (control === ")" || control === "}") depth = Math.max(0, depth - 1);
    preceding = control;
    start = i + 1;
  }

  return extents;
}
