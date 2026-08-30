import {
  assignedName,
  escalatesPrivilege,
  isTrustedCommandWord,
  pathResolvedCommandNames,
  simpleCommandExtents,
  simpleCommandAt,
} from "../../../shell/command-parser.ts";
import {
  evaluatesUnreadableArithmetic,
  expandsBeforeUse,
  rewritesCommandWord,
  scanSubstitutions,
} from "../../../shell/expansion.ts";
import { tokenizeShell } from "../../../shell/tokenizer.ts";
import type { ShellAst } from "../../../shell/ast.ts";
import type { SimpleCommand } from "../../../shell/command-parser.ts";
import type { ShellToken } from "../../../shell/types.ts";
import { classifierFor } from "../classifiers.ts";
import type { ClassificationVerdict } from "../classification.ts";
import type { HostPathCheck } from "../result.ts";
import { NESTED_SHELLS } from "./nested-shell.ts";

/**
 * One simple command's verdict. A destructive one may carry a host check: the command is harmless if the
 * host confirms the check, and needs approval otherwise. Only a top-level command keeps the check; a command
 * a nested shell, `xargs`, `find`, or `eval` runs reads it as destructive outright.
 */
type CommandVerdict = { destructive: false } | { destructive: true; hostCheck?: HostPathCheck };

const NOT_DESTRUCTIVE: CommandVerdict = { destructive: false };
const DESTRUCTIVE: CommandVerdict = { destructive: true };

function toCommandVerdict(verdict: ClassificationVerdict): CommandVerdict {
  if (verdict.kind === "safe") return NOT_DESTRUCTIVE;
  if (verdict.kind === "approval") return DESTRUCTIVE;
  return { destructive: true, hostCheck: verdict.check };
}

function simpleCommandIsDestructive(
  tokens: readonly ShellToken[],
  start: number,
  failClosed = true,
  resolvedCommand?: SimpleCommand,
): boolean {
  return simpleCommandVerdict(tokens, start, failClosed, resolvedCommand).destructive;
}

function simpleCommandVerdict(
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

  const classify = classifierFor(name);
  if (!classify) return NOT_DESTRUCTIVE;
  return toCommandVerdict(
    classify({
      name,
      args,
      argTexts,
      argIndices,
      failClosed,
      isDestructiveText,
      isDestructiveCommandAt: (nested) => simpleCommandIsDestructive(tokens, nested, failClosed),
    }),
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
