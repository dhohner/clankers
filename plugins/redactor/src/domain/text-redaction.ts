import type { RedactionEntry } from "./credential-registry.ts";

const REFERENCE_PREFIX = "[redacted:";
const REFERENCE_SUFFIX = "]";

/**
 * References embed ids in forms such as `[redacted:api-token]`.
 * Excluding whitespace and `]` gives each reference one unambiguous end.
 * The length limit bounds how much text a stream retains for an incomplete reference.
 */
export const MAX_REFERENCE_ID_LENGTH = 64;
export const REFERENCE_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;
const REFERENCE_ID_UNIT = /[A-Za-z0-9_.:-]/;
const MAX_REFERENCE_LENGTH = REFERENCE_PREFIX.length + MAX_REFERENCE_ID_LENGTH + REFERENCE_SUFFIX.length;

export interface RedactionTextOptions {
  /** Preserve newlines from replaced values so later line numbers remain stable. */
  preserveLineCount?: boolean;
}

export function referenceFor(id: string): string {
  return `${REFERENCE_PREFIX}${id}${REFERENCE_SUFFIX}`;
}

export function referenceLengthAt(text: string, position: number): number {
  if (!text.startsWith(REFERENCE_PREFIX, position)) return 0;
  const idStart = position + REFERENCE_PREFIX.length;
  let idEnd = idStart;
  while (idEnd < text.length && idEnd - idStart < MAX_REFERENCE_ID_LENGTH && REFERENCE_ID_UNIT.test(text[idEnd]!)) {
    idEnd += 1;
  }
  if (idEnd === idStart || text[idEnd] !== REFERENCE_SUFFIX) return 0;
  return idEnd + REFERENCE_SUFFIX.length - position;
}

export function isIncompleteReferenceFrom(text: string, position: number): boolean {
  const tail = text.slice(position, position + MAX_REFERENCE_LENGTH);
  if (text.length - position > tail.length) return false;
  if (tail.length < REFERENCE_PREFIX.length) return REFERENCE_PREFIX.startsWith(tail);
  if (!tail.startsWith(REFERENCE_PREFIX)) return false;
  const id = tail.slice(REFERENCE_PREFIX.length);
  return id.length <= MAX_REFERENCE_ID_LENGTH && [...id].every((unit) => REFERENCE_ID_UNIT.test(unit));
}

/**
 * Index values by their first code unit to limit each lookup to possible matches.
 * Order candidates by length so the longest match wins.
 * Compare exact code units without normalization or case folding.
 */
export class ValueMatcher {
  readonly #byFirstUnit = new Map<string, RedactionEntry[]>();
  readonly #entries: RedactionEntry[] = [];
  readonly #prefixTables = new Map<RedactionEntry, Uint32Array>();
  readonly #referenceIds = new Set<string>();
  readonly #longest: number;

  constructor(entries: readonly RedactionEntry[]) {
    let longest = 0;
    for (const entry of entries) {
      this.#referenceIds.add(entry.id);
      if (entry.value.length === 0) continue;
      this.#entries.push(entry);
      longest = Math.max(longest, entry.value.length);
      const candidates = this.#byFirstUnit.get(entry.value[0]!) ?? [];
      candidates.push(entry);
      this.#byFirstUnit.set(entry.value[0]!, candidates);
    }
    for (const candidates of this.#byFirstUnit.values()) {
      candidates.sort((a, b) => b.value.length - a.value.length);
    }
    this.#longest = longest;
  }

  get isEmpty(): boolean {
    return this.#byFirstUnit.size === 0;
  }

  get longestLength(): number {
    return this.#longest;
  }

  /**
   * Protect only references with current ids because the registry guarantees that they contain no registered value.
   * Scan references with other ids as ordinary text because they may wrap a credential.
   */
  protectedReferenceLengthAt(text: string, position: number): number {
    const length = referenceLengthAt(text, position);
    if (length === 0) return 0;
    const id = text.slice(position + REFERENCE_PREFIX.length, position + length - REFERENCE_SUFFIX.length);
    return this.#referenceIds.has(id) ? length : 0;
  }

  matchAt(text: string, position: number): RedactionEntry | undefined {
    const candidates = this.#byFirstUnit.get(text[position]!);
    if (!candidates) return undefined;
    return candidates.find((entry) => text.startsWith(entry.value, position));
  }

  couldExtendFrom(text: string, position: number): boolean {
    return this.partialAt(text, position) !== undefined;
  }

  partialAt(text: string, position: number): RedactionEntry | undefined {
    const candidates = this.#byFirstUnit.get(text[position]!);
    if (!candidates) return undefined;
    const length = text.length - position;
    return candidates.find((entry) => length < entry.value.length && startsWithRange(entry.value, text, position));
  }

  /**
   * Choose the longest value prefix ending at `cut`.
   * Break equal prefix lengths by choosing the longest value.
   * Prefix tables make each cut cost the sum of value lengths instead of comparing every possible start.
   */
  partialBefore(text: string, cut: number): { start: number; entry: RedactionEntry } | undefined {
    let best: { start: number; entry: RedactionEntry } | undefined;
    for (const entry of this.#entries) {
      const start = cut - this.#prefixLengthEndingAt(text, cut, entry);
      if (start === cut) continue;
      if (!best || start < best.start || (start === best.start && entry.value.length > best.entry.value.length)) {
        best = { start, entry };
      }
    }
    return best;
  }

  /** Start one value length before `cut` so the matched prefix remains shorter than the full value. */
  #prefixLengthEndingAt(text: string, cut: number, entry: RedactionEntry): number {
    const { value } = entry;
    const table = this.#prefixTableOf(entry);
    let matched = 0;
    for (let index = Math.max(0, cut - value.length + 1); index < cut; index += 1) {
      while (matched > 0 && value[matched] !== text[index]) matched = table[matched - 1]!;
      if (value[matched] === text[index]) matched += 1;
    }
    return matched;
  }

  #prefixTableOf(entry: RedactionEntry): Uint32Array {
    let table = this.#prefixTables.get(entry);
    if (!table) {
      table = prefixTableOf(entry.value);
      this.#prefixTables.set(entry, table);
    }
    return table;
  }
}

function startsWithRange(value: string, text: string, from: number): boolean {
  for (let index = from; index < text.length; index += 1) {
    if (text[index] !== value[index - from]) return false;
  }
  return true;
}

function prefixTableOf(value: string): Uint32Array {
  const table = new Uint32Array(value.length);
  let matched = 0;
  for (let index = 1; index < value.length; index += 1) {
    while (matched > 0 && value[index] !== value[matched]) matched = table[matched - 1]!;
    if (value[index] === value[matched]) matched += 1;
    table[index] = matched;
  }
  return table;
}

/**
 * Scan from left to right without rescanning replacements.
 * Preserve complete references with current ids so repeated passes remain stable.
 * This holds when an id, `redacted`, or reference syntax is itself registered.
 *
 * Scan references with other ids as ordinary text so wrapped credentials are still replaced.
 * A registered value wins when it is at least as long as the reference it starts.
 * This rule replaces values shaped like references and prevents longer values from leaving raw suffixes.
 *
 * Shorter matches are treated as reference fragments and do not rewrite the reference.
 */
export function redactText(
  text: string,
  entries: readonly RedactionEntry[],
  options: RedactionTextOptions = {},
): string {
  if (entries.length === 0 || text.length === 0) return text;
  return redactWithMatcher(text, new ValueMatcher(entries), options);
}

export function redactWithMatcher(text: string, matcher: ValueMatcher, options: RedactionTextOptions = {}): string {
  if (matcher.isEmpty || text.length === 0) return text;
  let output = "";
  let copiedUpTo = 0;
  let position = 0;
  while (position < text.length) {
    const reference = matcher.protectedReferenceLengthAt(text, position);
    const match = matcher.matchAt(text, position);
    if (match && match.value.length >= reference) {
      const replacement = options.preserveLineCount
        ? referenceFor(match.id) + newlinesOf(match.value)
        : referenceFor(match.id);
      output += text.slice(copiedUpTo, position) + replacement;
      position += match.value.length;
      copiedUpTo = position;
      continue;
    }
    position += Math.max(1, reference);
  }
  return copiedUpTo === 0 ? text : output + text.slice(copiedUpTo);
}

function newlinesOf(value: string): string {
  let count = 0;
  for (let index = value.indexOf("\n"); index !== -1; index = value.indexOf("\n", index + 1)) count += 1;
  return "\n".repeat(count);
}

/**
 * Replace value prefixes at host cut positions because complete value redaction cannot reach them.
 * Choose the longest prefix so one reference covers all surviving credential text.
 * Apply cuts from last to first and skip cuts inside replaced fragments.
 */
export function redactCuts(text: string, cuts: readonly number[], entries: readonly RedactionEntry[]): string {
  return redactCutsWithMatcher(text, cuts, new ValueMatcher(entries));
}

export function redactCutsWithMatcher(text: string, cuts: readonly number[], matcher: ValueMatcher): string {
  if (matcher.isEmpty || cuts.length === 0) return text;
  const pending = new Set(cuts);
  let result = text;
  // Walk backward so each replacement changes only text after the next cut.
  let cut = result.length;
  while (cut > 0) {
    const partial = pending.has(cut) ? matcher.partialBefore(result, cut) : undefined;
    if (!partial) {
      cut -= 1;
      continue;
    }
    result = result.slice(0, partial.start) + referenceFor(partial.entry.id) + result.slice(cut);
    cut = partial.start;
  }
  return result;
}
