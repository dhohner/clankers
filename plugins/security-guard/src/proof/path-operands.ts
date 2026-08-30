import { commandRule, COMMAND_RULES, type PathOptionModel } from "../commands/registry.ts";
import { spellsLongOption } from "../shell/option-scanner.ts";
import { sliceWord } from "../shell/tokenizer.ts";
import type { ShellToken } from "../shell/types.ts";
import { expandWord } from "./shell-state.ts";
import {
  proven,
  provenTarget,
  unprovable,
  type DestructiveTarget,
  type ProofResult,
  type ShellState,
} from "./types.ts";

export const PATH_TARGET_COMMANDS = new Set(
  COMMAND_RULES.filter((rule) => rule.effect.kind === "path").flatMap((rule) => rule.names),
);

type MoveOptionModel = Extract<PathOptionModel, { kind: "move" }>;
type ModeOptionModel = Extract<PathOptionModel, { kind: "mode" }>;

/** The paths `mv` reads and writes, destination included, or undefined when an option was not recognized. */
function extractMoveCommandPaths(args: readonly ShellToken[], model: MoveOptionModel): ShellToken[] | undefined {
  const words: ShellToken[] = [];
  let optionsEnded = false;

  for (let i = 0; i < args.length; i += 1) {
    const word = args[i];
    if (!word) continue;
    const arg = word.text;
    if (!optionsEnded && arg === "--") {
      optionsEnded = true;
      continue;
    }
    if (optionsEnded || !arg.startsWith("-") || arg === "-") {
      words.push(word);
      continue;
    }

    if (arg.startsWith("--")) {
      const inline = arg.indexOf("=");
      const base = inline < 0 ? arg : arg.slice(0, inline);
      if (model.longPathValues.has(base)) {
        const value = inline < 0 ? args[++i] : sliceWord(word, inline + 1);
        if (!value) return undefined;
        words.push(value);
        continue;
      }
      if (model.longValues.has(base)) {
        if (inline < 0) i += 1;
        continue;
      }
      if (!model.longFlags.has(base)) return undefined;
      continue;
    }

    // A short-option bundle ends at the first option taking a value; the rest of that word is its value.
    for (let position = 1; position < arg.length; position += 1) {
      const letter = arg[position] ?? "";
      if (model.shortFlags.includes(letter)) continue;
      if (!model.shortValues.includes(letter)) return undefined;
      const value = position + 1 < arg.length ? sliceWord(word, position + 1) : args[++i];
      if (!value) return undefined;
      if (letter === "t") words.push(value);
      break;
    }
  }
  return words;
}

// Options of `chmod` and `chown` that neither carry the mode or owner nor name a path. Anything else could be
// the mode itself (`chmod -R -w FILE`) or supply it (`--reference=RFILE`), and the first operand would then
// be a path rather than the mode this scan drops. `-R` and `--recursive` are absent: the entries below the
// operand are never inspected here, and a hard link among them shares its inode with a name that may lie
// outside any temporary root, so a recursive change could reach that file. `-H` only follows the operand
// itself, which is resolved the same way before the command runs.
/** The path operands of `chmod`/`chown`, or undefined when an option could have supplied the mode. */
function extractModeCommandPaths(args: readonly ShellToken[], model: ModeOptionModel): ShellToken[] | undefined {
  const words: ShellToken[] = [];
  let optionsEnded = false;

  for (const word of args) {
    const arg = word.text;
    if (!optionsEnded && arg === "--") {
      optionsEnded = true;
      continue;
    }
    if (optionsEnded || !arg.startsWith("-") || arg === "-") {
      words.push(word);
      continue;
    }
    if (arg.startsWith("--")) {
      if (!model.longFlags.has(arg)) return undefined;
      continue;
    }
    // `arg` is a string, so `String#slice` returns a string and the spread is what makes `.some` valid.
    // oxlint reads any `.slice()` as an array clone, and its fix removes the spread, which throws.
    // oxlint-disable-next-line unicorn/no-useless-spread
    if ([...arg.slice(1)].some((letter) => !model.shortFlags.includes(letter))) return undefined;
  }

  // The first operand is the mode or the owner, not a path.
  words.shift();
  return words;
}

function extractPathOperandsValue(name: string, args: readonly ShellToken[]): ShellToken[] | undefined {
  const effect = commandRule(name)?.effect;
  if (!effect || effect.kind !== "path") return undefined;
  const options = effect.options;
  if (options.kind === "move") return extractMoveCommandPaths(args, options);
  if (options.kind === "mode") return extractModeCommandPaths(args, options);

  const words: ShellToken[] = [];
  let optionsEnded = false;
  for (let i = 0; i < args.length; i += 1) {
    const word = args[i];
    if (!word) continue;
    const arg = word.text;
    if (!optionsEnded && arg === "--") {
      optionsEnded = true;
    } else if (!optionsEnded && arg.startsWith("--")) {
      if (options.rejectLong && spellsLongOption(arg, options.rejectLong)) return undefined;
      if (spellsLongOption(arg, options.longValues)) {
        if (!arg.includes("=")) i += 1;
      } else if (!spellsLongOption(arg, options.longFlags)) {
        return undefined;
      }
    } else if (!optionsEnded && arg.startsWith("-") && arg !== "-") {
      for (let position = 1; position < arg.length; position += 1) {
        const letter = arg[position] ?? "";
        if (options.rejectShort?.includes(letter)) return undefined;
        if (options.shortFlags.includes(letter)) continue;
        if (!options.shortValues.includes(letter)) return undefined;
        if (position + 1 === arg.length) i += 1;
        break;
      }
    } else {
      words.push(word);
    }
  }
  return words;
}

// A wildcard may match a symlink, and `rm`/`mv` act on the link itself; but a path component after the
// wildcard, or a recursive `**`, would traverse through a matched link.
function globStaysShallow(path: string): boolean {
  const globStart = path.search(/[*?[]/);
  if (globStart < 0) return true;
  return !path.slice(globStart).includes("/") && !path.includes("**");
}

export function extractPathOperands(name: string, args: readonly ShellToken[]): ProofResult<ShellToken[]> {
  const words = extractPathOperandsValue(name, args);
  return words && words.length > 0 ? proven(words) : unprovable("path operands cannot be identified");
}

export function extractPathTargets(
  name: string,
  args: readonly ShellToken[],
  state: ShellState,
): ProofResult<DestructiveTarget[]> {
  const operands = extractPathOperands(name, args);
  if (operands.kind === "unprovable") return operands;

  const targets: DestructiveTarget[] = [];
  for (const word of operands.value) {
    const target = expandWord(word, state);
    if (target.kind === "unprovable") return target;
    const hasGlob = /[*?[]/.test(target.value.path);
    const effect = commandRule(name)?.effect;
    if (!effect || effect.kind !== "path") return unprovable("command has no path-target model");
    if (hasGlob && (!effect.allowsShallowGlob || !globStaysShallow(target.value.path))) {
      return unprovable("path glob can traverse outside the proven target");
    }
    targets.push(provenTarget(target.value, effect.symlinkBehavior === "target"));
  }
  return proven(targets);
}

/**
 * Commands that create or update exactly the paths they are given, so their operands are checked like a
 * destructive command's. An option outside these tables might consume an operand or add a path of its own,
 * so an unrecognized one makes the call unprovable rather than silently dropping a target.
 */
export const WRITE_TARGET_COMMANDS: ReadonlySet<string> = new Set(
  COMMAND_RULES.filter((rule) => rule.effect.kind === "write").flatMap((rule) => rule.names),
);

export function extractWriteTargets(
  name: string,
  args: readonly ShellToken[],
  state: ShellState,
): ProofResult<DestructiveTarget[]> {
  const model = commandRule(name)?.effect;
  if (!model || model.kind !== "write") return unprovable("command has no write-target model");

  const words: ShellToken[] = [];
  let optionsEnded = false;
  for (let i = 0; i < args.length; i += 1) {
    const word = args[i];
    if (!word) continue;
    const arg = word.text;
    if (!optionsEnded && arg === "--") {
      optionsEnded = true;
      continue;
    }
    if (!optionsEnded && arg.startsWith("-") && arg !== "-") {
      const inline = arg.indexOf("=");
      const flag = inline < 0 ? arg : arg.slice(0, inline);
      if (model.valueOptions.has(flag)) {
        if (inline < 0) i += 1;
        continue;
      }
      if (inline < 0 && model.flagOptions.has(flag)) continue;
      return unprovable("write-target option cannot be identified");
    }
    words.push(word);
  }

  const targets: DestructiveTarget[] = [];
  for (const word of words) {
    const target = expandWord(word, state);
    if (target.kind === "unprovable") return target;
    // A wildcard operand names paths that already exist, which these commands are not used to reach.
    if (/[*?[]/.test(target.value.path)) return unprovable("write target contains a wildcard");
    targets.push(provenTarget(target.value, model.symlinkBehavior === "target"));
  }
  return proven(targets);
}
