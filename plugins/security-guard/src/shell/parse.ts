import {
  parseCommand,
  resolveCommand,
  simpleCommandExtents,
} from "./command-parser.ts";
import {
  tokenizeShell,
  type UnsupportedShellSyntax,
} from "./tokenizer.ts";
import type { ShellAst } from "./ast.ts";

export type ShellParseResult =
  | { kind: "parsed"; ast: ShellAst }
  | { kind: "unsupported"; reason: UnsupportedShellSyntax };

/** Parses the accepted shell subset once and retains each command's parsed and resolved forms. */
export function parseShell(value: string): ShellParseResult {
  const tokenization = tokenizeShell(value);
  if (tokenization.kind === "unsupported") return tokenization;

  const commands = simpleCommandExtents(tokenization.tokens).map((extent) => {
    const parsed = parseCommand(tokenization.tokens, extent.start);
    return { extent, parsed, resolved: resolveCommand(parsed) };
  });
  return {
    kind: "parsed",
    ast: { source: value, tokens: tokenization.tokens, commands },
  };
}
