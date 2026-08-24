import type { CommandExtent, ParsedCommand, SimpleCommand } from "./command-parser.ts";
import type { ShellToken } from "./types.ts";

export type ParsedCommandInvocation = {
  extent: CommandExtent;
  parsed: ParsedCommand;
  resolved: SimpleCommand;
};

export type ShellAst = {
  source: string;
  tokens: readonly ShellToken[];
  commands: readonly ParsedCommandInvocation[];
};
