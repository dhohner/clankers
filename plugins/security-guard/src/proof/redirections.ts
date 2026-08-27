import type { Redirection } from "../shell/command-parser.ts";
import { expandWord } from "./shell-state.ts";
import { runsSubstitution } from "../shell/tokenizer.ts";
import {
  proven,
  provenTarget,
  unprovable,
  type DestructiveTarget,
  type ProofResult,
  type ShellState,
} from "./types.ts";

// Redirections that create or truncate their target; `<>` opens it for writing too.
const WRITE_OPERATORS: ReadonlySet<string> = new Set([">", ">>", ">|", "&>", "&>>", "<>"]);
// Descriptor duplication; bash writes to a file instead when the target is not a descriptor.
const DUPLICATE_OPERATORS: ReadonlySet<string> = new Set([">&", "<&"]);
const FILE_DESCRIPTOR = /^([0-9]+-?|-)$/;
// Writing to these changes no file: the null sink, the terminal, and descriptors whose own redirection this
// call already accounts for.
const DISCARDED_REDIRECT_TARGET = /^\/dev\/(null|tty|stdout|stderr|fd\/[0-9]+)$/;

/** The paths a command's redirections write to, or an explicit reason they cannot be proven harmless. */
export function extractRedirectionTargets(
  redirections: readonly Redirection[],
  state: ShellState,
): ProofResult<DestructiveTarget[]> {
  const targets: DestructiveTarget[] = [];
  for (const { operator, target } of redirections) {
    // Bash expands the target of a reading redirection too, so a substitution there runs unseen.
    if (target && runsSubstitution(target)) {
      return unprovable("redirection target contains a substitution");
    }
    if (DUPLICATE_OPERATORS.has(operator)) {
      if (!target || !FILE_DESCRIPTOR.test(target.text)) return unprovable("descriptor target is not a descriptor");
      continue;
    }
    // `<`, `<<<`, and `<<` only read; a here-document supplies data and names no path, and `proveShellEffects`
    // checks its body for substitutions separately.
    if (!WRITE_OPERATORS.has(operator)) continue;
    if (!target) return unprovable("write redirection has no target");
    const expanded = expandWord(target, state);
    if (expanded.kind === "unprovable") return expanded;
    // Bash rejects a redirection whose wildcard matches more than one path, so no wildcard is provable here.
    if (/[*?[]/.test(expanded.value.path)) return unprovable("redirection target contains a wildcard");
    if (!expanded.value.insideMktempDirectory && DISCARDED_REDIRECT_TARGET.test(expanded.value.path)) continue;
    targets.push(provenTarget(expanded.value, true));
  }
  return proven(targets);
}
