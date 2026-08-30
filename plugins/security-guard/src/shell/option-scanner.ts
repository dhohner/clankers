import type { OptionModel } from "../commands/option-model.ts";
import type { Word } from "./types.ts";

/**
 * Whether a long option word spells one of `long`. GNU getopt accepts any unambiguous prefix of a long option
 * (`--for` for `--force`), and rejects an ambiguous one, so a prefix that could be the option is taken as the
 * option. Treating a rejected word as potentially destructive only adds an approval prompt.
 */
export function spellsLongOption(arg: string, long: readonly string[]): boolean {
  const inline = arg.indexOf("=");
  const name = inline < 0 ? arg : arg.slice(0, inline);
  return name.length > 2 && long.some((option) => option.startsWith(name));
}

/**
 * Where one option ends, whether it puts paths outside the command's operands, and whether it turns the
 * wrapper into a report on the following word that runs nothing.
 */
export type OptionScan = { index: number; stateful: boolean; inspects: boolean };

/** The scan after one option, or undefined when the option is not a known form. */
function skipOption(model: OptionModel, words: readonly Word[], index: number): OptionScan | undefined {
  const arg = words[index]?.text ?? "";
  const scan = (next: number, ...options: string[]): OptionScan => ({
    index: next,
    stateful: options.some((option) => model.stateful?.has(option) ?? false),
    inspects: options.some((option) => model.inspect?.has(option) ?? false),
  });

  if (arg.startsWith("--")) {
    const inline = arg.indexOf("=");
    if (inline >= 0) {
      const base = arg.slice(0, inline);
      if (!model.value.has(base) && !model.flag.has(base)) return undefined;
      return scan(index + 1, base);
    }
    if (model.value.has(arg)) return scan(index + 2, arg);
    return model.flag.has(arg) ? scan(index + 1, arg) : undefined;
  }

  // `nice -10` is an adjustment, not a bundle of options.
  if (model.numeric && /^-[0-9]+$/.test(arg)) return scan(index + 1);
  if (model.value.has(arg)) return scan(index + 2, arg);
  if (model.flag.has(arg)) return scan(index + 1, arg);

  // A short-option bundle ends at the first option taking a value; the rest of that word is its value.
  const options: string[] = [];
  for (let position = 1; position < arg.length; position += 1) {
    const option = `-${arg[position]}`;
    options.push(option);
    if (model.flag.has(option)) continue;
    if (model.value.has(option)) return scan(position + 1 < arg.length ? index + 1 : index + 2, ...options);
    return undefined;
  }
  return scan(index + 1, ...options);
}

/** The scan up to the command word, or undefined when an option could not be recognized. */
export function skipOptionsOf(model: OptionModel, words: readonly Word[], start: number): OptionScan | undefined {
  let index = start;
  let stateful = model.alwaysStateful ?? false;
  let inspects = false;
  while (index < words.length) {
    const arg = words[index]?.text ?? "";
    if (arg === "--") {
      index += 1;
      break;
    }
    if (arg === "-" || !arg.startsWith("-")) break;
    const step = skipOption(model, words, index);
    if (!step) return undefined;
    stateful ||= step.stateful;
    inspects ||= step.inspects;
    index = step.index;
  }
  return { index: index + (model.operands ?? 0), stateful, inspects };
}

/** Whether `args` carry the short option `letter` in any bundle, or one of the `long` spellings, before `--`. */
export function hasOption(args: readonly string[], letter: string | undefined, long: readonly string[]): boolean {
  for (const arg of args) {
    if (arg === "--") return false;
    if (!arg.startsWith("-")) continue;
    if (arg.startsWith("--")) {
      if (spellsLongOption(arg, long)) return true;
    } else if (letter !== undefined && arg.includes(letter)) {
      return true;
    }
  }
  return false;
}
